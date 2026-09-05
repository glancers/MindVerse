use axum::extract::{Path, Query, State};
use axum::Json;
use sqlx::sqlite::SqliteRow;
use sqlx::{Row, SqlitePool};

use crate::auth::AuthUser;
use crate::error::{ApiResult, AppError};
use crate::models::{
    ConversationDto, FavoriteDto, MessageDto, MessageQuery, PersonaDto, ProviderIn, ProviderOut,
    SettingsDto,
};
use crate::{now_ms, AppState};

/// 资源归属校验：已存在且属于他人 → 404（不暴露存在性）；不存在 → 视为新建
async fn assert_owner_or_new(db: &SqlitePool, table: &str, id: &str, user_id: &str) -> ApiResult<()> {
    let owner: Option<String> =
        sqlx::query_scalar(&format!("SELECT user_id FROM {table} WHERE id = ?"))
            .bind(id)
            .fetch_optional(db)
            .await?;
    match owner {
        Some(o) if o != user_id => Err(AppError::NotFound),
        _ => Ok(()),
    }
}

/// 会话归属校验：不属于当前用户 → 404
async fn assert_conversation_owner(db: &SqlitePool, conv_id: &str, user_id: &str) -> ApiResult<()> {
    let owner: Option<String> =
        sqlx::query_scalar("SELECT user_id FROM conversations WHERE id = ?")
            .bind(conv_id)
            .fetch_optional(db)
            .await?;
    match owner {
        Some(o) if o == user_id => Ok(()),
        _ => Err(AppError::NotFound),
    }
}

// ---------- personas ----------

fn row_to_persona(row: &SqliteRow) -> PersonaDto {
    let traits_raw: String = row.try_get("traits").unwrap_or_else(|_| "[]".into());
    let binding_raw: Option<String> = row.try_get("model_binding").ok().flatten();
    PersonaDto {
        id: row.try_get("id").unwrap_or_default(),
        name: row.try_get("name").unwrap_or_default(),
        avatar: row.try_get("avatar").ok().flatten(),
        color: row.try_get("color").unwrap_or_default(),
        tagline: row.try_get("tagline").ok().flatten(),
        group: row.try_get("group_name").ok().flatten(),
        traits: serde_json::from_str(&traits_raw).unwrap_or_default(),
        system_prompt: row.try_get("system_prompt").unwrap_or_default(),
        model_binding: binding_raw.and_then(|s| serde_json::from_str(&s).ok()),
        is_preset: row.try_get::<i64, _>("is_preset").unwrap_or(0) != 0,
        created_at: row.try_get("created_at").unwrap_or(0),
        updated_at: row.try_get("updated_at").unwrap_or(0),
    }
}

async fn upsert_persona_inner(
    state: &AppState,
    user_id: &str,
    mut p: PersonaDto,
) -> ApiResult<PersonaDto> {
    if p.name.trim().is_empty() || p.system_prompt.trim().is_empty() {
        return Err(AppError::BadRequest("人格名字与设定不能为空".into()));
    }
    assert_owner_or_new(&state.db, "personas", &p.id, user_id).await?;

    // 尊重客户端 updatedAt（多端合并依据）；仅老数据缺失时补时间戳
    if p.created_at == 0 {
        p.created_at = now_ms();
        p.updated_at = p.updated_at.max(p.created_at);
    }
    let traits = serde_json::to_string(&p.traits).map_err(|_| AppError::Internal)?;
    let binding = p
        .model_binding
        .as_ref()
        .map(|v| v.to_string())
        .unwrap_or_default();

    sqlx::query(
        r#"INSERT INTO personas (id, user_id, name, avatar, color, tagline, group_name, traits, system_prompt, model_binding, is_preset, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
           ON CONFLICT(id) DO UPDATE SET
             name=excluded.name, avatar=excluded.avatar, color=excluded.color, tagline=excluded.tagline,
             group_name=excluded.group_name, traits=excluded.traits, system_prompt=excluded.system_prompt, model_binding=excluded.model_binding,
             is_preset=excluded.is_preset, updated_at=excluded.updated_at
           WHERE excluded.updated_at > personas.updated_at"#,
    )
    .bind(&p.id)
    .bind(user_id)
    .bind(p.name.trim())
    .bind(&p.avatar)
    .bind(&p.color)
    .bind(&p.tagline)
    .bind(p.group.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(&traits)
    .bind(p.system_prompt.trim())
    .bind(if binding.is_empty() { None } else { Some(&binding) })
    .bind(p.is_preset as i64)
    .bind(p.created_at)
    .bind(p.updated_at)
    .execute(&state.db)
    .await?;

    Ok(p)
}

pub async fn list_personas(
    user: AuthUser,
    State(state): State<AppState>,
) -> ApiResult<Json<Vec<PersonaDto>>> {
    let rows = sqlx::query("SELECT * FROM personas WHERE user_id = ? ORDER BY updated_at DESC")
        .bind(&user.user_id)
        .fetch_all(&state.db)
        .await?;
    Ok(Json(rows.iter().map(row_to_persona).collect()))
}

pub async fn upsert_persona(
    user: AuthUser,
    State(state): State<AppState>,
    Json(p): Json<PersonaDto>,
) -> ApiResult<Json<PersonaDto>> {
    Ok(Json(upsert_persona_inner(&state, &user.user_id, p).await?))
}

pub async fn update_persona(
    user: AuthUser,
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(mut p): Json<PersonaDto>,
) -> ApiResult<Json<PersonaDto>> {
    p.id = id; // 以路径 id 为准
    Ok(Json(upsert_persona_inner(&state, &user.user_id, p).await?))
}

pub async fn delete_persona(
    user: AuthUser,
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<()> {
    let res = sqlx::query("DELETE FROM personas WHERE id = ? AND user_id = ?")
        .bind(&id)
        .bind(&user.user_id)
        .execute(&state.db)
        .await?;
    if res.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }
    Ok(())
}

// ---------- conversations ----------

fn row_to_conversation(row: &SqliteRow) -> ConversationDto {
    let ids_raw: String = row.try_get("persona_ids").unwrap_or_else(|_| "[]".into());
    ConversationDto {
        id: row.try_get("id").unwrap_or_default(),
        conv_type: row.try_get("type").unwrap_or_default(),
        title: row.try_get("title").unwrap_or_default(),
        persona_ids: serde_json::from_str(&ids_raw).unwrap_or_default(),
        host_persona_id: row.try_get("host_persona_id").ok().flatten(),
        pinned: row.try_get::<i64, _>("pinned").unwrap_or(0) != 0,
        folded: row.try_get::<i64, _>("folded").unwrap_or(0) != 0,
        created_at: row.try_get("created_at").unwrap_or(0),
        updated_at: row.try_get("updated_at").unwrap_or(0),
    }
}

async fn upsert_conversation_inner(
    state: &AppState,
    user_id: &str,
    mut c: ConversationDto,
) -> ApiResult<ConversationDto> {
    if c.title.trim().is_empty() {
        return Err(AppError::BadRequest("会话标题不能为空".into()));
    }
    if c.conv_type != "private" && c.conv_type != "group" {
        return Err(AppError::BadRequest("会话类型必须是 private 或 group".into()));
    }
    assert_owner_or_new(&state.db, "conversations", &c.id, user_id).await?;

    // 尊重客户端 updatedAt（多端合并依据）；仅老数据缺失时补时间戳
    if c.created_at == 0 {
        c.created_at = now_ms();
        c.updated_at = c.updated_at.max(c.created_at);
    }
    let ids = serde_json::to_string(&c.persona_ids).map_err(|_| AppError::Internal)?;

    sqlx::query(
        r#"INSERT INTO conversations (id, user_id, type, title, persona_ids, host_persona_id, pinned, folded, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?)
           ON CONFLICT(id) DO UPDATE SET
             type=excluded.type, title=excluded.title, persona_ids=excluded.persona_ids,
             host_persona_id=excluded.host_persona_id, pinned=excluded.pinned, folded=excluded.folded,
             updated_at=excluded.updated_at
           WHERE excluded.updated_at > conversations.updated_at"#,
    )
    .bind(&c.id)
    .bind(user_id)
    .bind(&c.conv_type)
    .bind(c.title.trim())
    .bind(&ids)
    .bind(&c.host_persona_id)
    .bind(c.pinned)
    .bind(c.folded)
    .bind(c.created_at)
    .bind(c.updated_at)
    .execute(&state.db)
    .await?;

    Ok(c)
}

pub async fn list_conversations(
    user: AuthUser,
    State(state): State<AppState>,
) -> ApiResult<Json<Vec<ConversationDto>>> {
    let rows = sqlx::query("SELECT * FROM conversations WHERE user_id = ? ORDER BY updated_at DESC")
        .bind(&user.user_id)
        .fetch_all(&state.db)
        .await?;
    Ok(Json(rows.iter().map(row_to_conversation).collect()))
}

pub async fn upsert_conversation(
    user: AuthUser,
    State(state): State<AppState>,
    Json(c): Json<ConversationDto>,
) -> ApiResult<Json<ConversationDto>> {
    Ok(Json(upsert_conversation_inner(&state, &user.user_id, c).await?))
}

pub async fn update_conversation(
    user: AuthUser,
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(mut c): Json<ConversationDto>,
) -> ApiResult<Json<ConversationDto>> {
    c.id = id;
    Ok(Json(upsert_conversation_inner(&state, &user.user_id, c).await?))
}

pub async fn delete_conversation(
    user: AuthUser,
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<()> {
    let res = sqlx::query("DELETE FROM conversations WHERE id = ? AND user_id = ?")
        .bind(&id)
        .bind(&user.user_id)
        .execute(&state.db)
        .await?;
    if res.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }
    sqlx::query("DELETE FROM messages WHERE conversation_id = ? AND user_id = ?")
        .bind(&id)
        .bind(&user.user_id)
        .execute(&state.db)
        .await?;
    Ok(())
}

// ---------- messages ----------

fn row_to_message(row: &SqliteRow) -> MessageDto {
    let attachments_raw: Option<String> = row.try_get("attachments").ok().flatten();
    MessageDto {
        id: row.try_get("id").unwrap_or_default(),
        conversation_id: row.try_get("conversation_id").unwrap_or_default(),
        role: row.try_get("role").unwrap_or_default(),
        sender_persona_id: row.try_get("sender_persona_id").ok().flatten(),
        content: row.try_get("content").unwrap_or_default(),
        thinking: row.try_get("thinking").ok().flatten(),
        attachments: attachments_raw.and_then(|s| serde_json::from_str(&s).ok()),
        created_at: row.try_get("created_at").unwrap_or(0),
        status: row.try_get("status").unwrap_or_default(),
    }
}

pub async fn list_messages(
    user: AuthUser,
    State(state): State<AppState>,
    Path(conv_id): Path<String>,
    Query(q): Query<MessageQuery>,
) -> ApiResult<Json<Vec<MessageDto>>> {
    assert_conversation_owner(&state.db, &conv_id, &user.user_id).await?;
    let after = q.after.unwrap_or(0);
    let limit = q.limit.unwrap_or(500).clamp(1, 1000);
    let rows = sqlx::query(
        "SELECT * FROM messages WHERE conversation_id = ? AND user_id = ? AND created_at > ? ORDER BY created_at ASC LIMIT ?",
    )
    .bind(&conv_id)
    .bind(&user.user_id)
    .bind(after)
    .bind(limit)
    .fetch_all(&state.db)
    .await?;
    Ok(Json(rows.iter().map(row_to_message).collect()))
}

pub async fn upsert_message(
    user: AuthUser,
    State(state): State<AppState>,
    Json(m): Json<MessageDto>,
) -> ApiResult<Json<MessageDto>> {
    let has_attachments = m.attachments.as_ref().is_some_and(|a| !a.is_empty());
    if m.conversation_id.is_empty()
        || (m.content.is_empty()
            && m.thinking.as_deref().unwrap_or("").is_empty()
            && !has_attachments)
    {
        return Err(AppError::BadRequest("消息缺少会话 id 或内容".into()));
    }
    assert_conversation_owner(&state.db, &m.conversation_id, &user.user_id).await?;
    assert_owner_or_new(&state.db, "messages", &m.id, &user.user_id).await?;

    let attachments = match &m.attachments {
        Some(a) if !a.is_empty() => Some(serde_json::to_string(a).map_err(|_| AppError::Internal)?),
        _ => None,
    };
    sqlx::query(
        r#"INSERT INTO messages (id, user_id, conversation_id, role, sender_persona_id, content, thinking, attachments, created_at, status)
           VALUES (?,?,?,?,?,?,?,?,?,?)
           ON CONFLICT(id) DO UPDATE SET
             role=excluded.role, sender_persona_id=excluded.sender_persona_id, content=excluded.content,
             thinking=excluded.thinking, attachments=excluded.attachments, status=excluded.status"#,
    )
    .bind(&m.id)
    .bind(&user.user_id)
    .bind(&m.conversation_id)
    .bind(&m.role)
    .bind(&m.sender_persona_id)
    .bind(&m.content)
    .bind(&m.thinking)
    .bind(&attachments)
    .bind(m.created_at)
    .bind(&m.status)
    .execute(&state.db)
    .await?;

    Ok(Json(m))
}

pub async fn delete_message(
    user: AuthUser,
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<()> {
    let res = sqlx::query("DELETE FROM messages WHERE id = ? AND user_id = ?")
        .bind(&id)
        .bind(&user.user_id)
        .execute(&state.db)
        .await?;
    if res.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }
    Ok(())
}

// ---------- providers（apiKey 只进不出）----------

fn row_to_provider_out(row: &SqliteRow) -> ProviderOut {
    let models_raw: String = row.try_get("models").unwrap_or_else(|_| "[]".into());
    ProviderOut {
        id: row.try_get("id").unwrap_or_default(),
        provider_type: row.try_get("type").unwrap_or_default(),
        name: row.try_get("name").unwrap_or_default(),
        base_url: row.try_get("base_url").unwrap_or_default(),
        models: serde_json::from_str(&models_raw).unwrap_or_default(),
        default_model: row.try_get("default_model").unwrap_or_default(),
    }
}

async fn upsert_provider_inner(
    state: &AppState,
    user_id: &str,
    p: ProviderIn,
) -> ApiResult<ProviderOut> {
    if p.name.trim().is_empty() || p.base_url.trim().is_empty() {
        return Err(AppError::BadRequest("服务商名称与 Base URL 不能为空".into()));
    }
    assert_owner_or_new(&state.db, "providers", &p.id, user_id).await?;

    // Key 解析：新建必填；更新留空 = 保持原值（服务器模式编辑不回显 Key）
    let api_key = match p.api_key.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        Some(k) => k.to_string(),
        None => {
            let existing: Option<String> =
                sqlx::query_scalar("SELECT api_key FROM providers WHERE id = ?")
                    .bind(&p.id)
                    .fetch_optional(&state.db)
                    .await?
                    .flatten();
            existing.ok_or_else(|| AppError::BadRequest("新建服务商必须填写 API Key".into()))?
        }
    };

    let models = serde_json::to_string(&p.models).map_err(|_| AppError::Internal)?;
    sqlx::query(
        r#"INSERT INTO providers (id, user_id, type, name, base_url, api_key, models, default_model, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?)
           ON CONFLICT(id) DO UPDATE SET
             type=excluded.type, name=excluded.name, base_url=excluded.base_url, api_key=excluded.api_key,
             models=excluded.models, default_model=excluded.default_model, updated_at=excluded.updated_at"#,
    )
    .bind(&p.id)
    .bind(user_id)
    .bind(&p.provider_type)
    .bind(p.name.trim())
    .bind(p.base_url.trim())
    .bind(&api_key)
    .bind(&models)
    .bind(&p.default_model)
    .bind(now_ms())
    .bind(now_ms())
    .execute(&state.db)
    .await?;

    Ok(ProviderOut {
        id: p.id,
        provider_type: p.provider_type,
        name: p.name.trim().to_string(),
        base_url: p.base_url.trim().to_string(),
        models: p.models,
        default_model: p.default_model,
    })
}

pub async fn list_providers(
    user: AuthUser,
    State(state): State<AppState>,
) -> ApiResult<Json<Vec<ProviderOut>>> {
    let rows = sqlx::query("SELECT * FROM providers WHERE user_id = ? ORDER BY updated_at DESC")
        .bind(&user.user_id)
        .fetch_all(&state.db)
        .await?;
    Ok(Json(rows.iter().map(row_to_provider_out).collect()))
}

pub async fn upsert_provider(
    user: AuthUser,
    State(state): State<AppState>,
    Json(p): Json<ProviderIn>,
) -> ApiResult<Json<ProviderOut>> {
    Ok(Json(upsert_provider_inner(&state, &user.user_id, p).await?))
}

pub async fn update_provider(
    user: AuthUser,
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(mut p): Json<ProviderIn>,
) -> ApiResult<Json<ProviderOut>> {
    p.id = id;
    Ok(Json(upsert_provider_inner(&state, &user.user_id, p).await?))
}

pub async fn delete_provider(
    user: AuthUser,
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<()> {
    let res = sqlx::query("DELETE FROM providers WHERE id = ? AND user_id = ?")
        .bind(&id)
        .bind(&user.user_id)
        .execute(&state.db)
        .await?;
    if res.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }
    Ok(())
}

// ---------- settings ----------

pub async fn get_settings(
    user: AuthUser,
    State(state): State<AppState>,
) -> ApiResult<Json<SettingsDto>> {
    let row = sqlx::query(
        "SELECT active_provider_id, active_model, default_rounds FROM settings WHERE user_id = ?",
    )
    .bind(&user.user_id)
    .fetch_optional(&state.db)
    .await?;

    Ok(Json(match row {
        Some(r) => SettingsDto {
            active_provider_id: r.try_get("active_provider_id").unwrap_or_default(),
            active_model: r.try_get("active_model").unwrap_or_default(),
            default_rounds: r.try_get("default_rounds").unwrap_or(3),
        },
        None => SettingsDto::default(),
    }))
}

pub async fn put_settings(
    user: AuthUser,
    State(state): State<AppState>,
    Json(s): Json<SettingsDto>,
) -> ApiResult<Json<SettingsDto>> {
    let rounds = s.default_rounds.clamp(1, 10);
    sqlx::query(
        r#"INSERT INTO settings (user_id, active_provider_id, active_model, default_rounds)
           VALUES (?,?,?,?)
           ON CONFLICT(user_id) DO UPDATE SET
             active_provider_id=excluded.active_provider_id, active_model=excluded.active_model,
             default_rounds=excluded.default_rounds"#,
    )
    .bind(&user.user_id)
    .bind(&s.active_provider_id)
    .bind(&s.active_model)
    .bind(rounds)
    .execute(&state.db)
    .await?;

    Ok(Json(SettingsDto {
        active_provider_id: s.active_provider_id,
        active_model: s.active_model,
        default_rounds: rounds,
    }))
}

// ---------- favorites（消息收藏：快照式整条替换，无编辑冲突问题）----------

fn row_to_favorite(row: &SqliteRow) -> FavoriteDto {
    let items_raw: String = row.try_get("items").unwrap_or_else(|_| "[]".into());
    FavoriteDto {
        id: row.try_get("id").unwrap_or_default(),
        items: serde_json::from_str(&items_raw).unwrap_or_default(),
        conversation_id: row.try_get("conversation_id").unwrap_or_default(),
        conversation_title: row.try_get("conversation_title").unwrap_or_default(),
        created_at: row.try_get("created_at").unwrap_or(0),
        last_used_at: row.try_get("last_used_at").unwrap_or(0),
    }
}

pub async fn list_favorites(
    user: AuthUser,
    State(state): State<AppState>,
) -> ApiResult<Json<Vec<FavoriteDto>>> {
    let rows = sqlx::query("SELECT * FROM favorites WHERE user_id = ? ORDER BY created_at DESC")
        .bind(&user.user_id)
        .fetch_all(&state.db)
        .await?;
    Ok(Json(rows.iter().map(row_to_favorite).collect()))
}

pub async fn upsert_favorite(
    user: AuthUser,
    State(state): State<AppState>,
    Json(f): Json<FavoriteDto>,
) -> ApiResult<Json<FavoriteDto>> {
    if f.items.is_empty() {
        return Err(AppError::BadRequest("收藏至少包含一条消息".into()));
    }
    if f.conversation_id.is_empty() {
        return Err(AppError::BadRequest("收藏缺少来源会话".into()));
    }
    assert_owner_or_new(&state.db, "favorites", &f.id, &user.user_id).await?;

    let items = serde_json::to_string(&f.items).map_err(|_| AppError::Internal)?;
    let created_at = if f.created_at == 0 { now_ms() } else { f.created_at };
    sqlx::query(
        r#"INSERT INTO favorites (id, user_id, conversation_id, conversation_title, items, created_at, last_used_at)
           VALUES (?,?,?,?,?,?,?)
           ON CONFLICT(id) DO UPDATE SET
             conversation_id=excluded.conversation_id, conversation_title=excluded.conversation_title,
             items=excluded.items, created_at=excluded.created_at, last_used_at=excluded.last_used_at"#,
    )
    .bind(&f.id)
    .bind(&user.user_id)
    .bind(&f.conversation_id)
    .bind(&f.conversation_title)
    .bind(&items)
    .bind(created_at)
    .bind(f.last_used_at)
    .execute(&state.db)
    .await?;

    Ok(Json(FavoriteDto { created_at, ..f }))
}

pub async fn delete_favorite(
    user: AuthUser,
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<()> {
    let res = sqlx::query("DELETE FROM favorites WHERE id = ? AND user_id = ?")
        .bind(&id)
        .bind(&user.user_id)
        .execute(&state.db)
        .await?;
    if res.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }
    Ok(())
}
