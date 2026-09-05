//! MindVerse 服务端：可独立运行（bin），也可嵌入 Tauri 桌面端（lib）。

use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions};
use tower_http::cors::CorsLayer;
use tower_http::trace::TraceLayer;

pub mod ark;
pub mod auth;
pub mod error;
pub mod llm;
pub mod models;
pub mod routes;

#[derive(Clone)]
pub struct AppState {
    pub db: sqlx::SqlitePool,
    pub jwt_secret: String,
}

pub fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

/// 服务启动配置（独立运行时来自环境变量，桌面端由 Tauri 传入）
pub struct ServerConfig {
    pub database_path: String,
    pub listen_addr: String,
    pub jwt_secret: String,
}

/// 启动 HTTP 服务：绑定监听地址后立刻返回实际端口，serve 在后台任务里跑。
/// 监听地址填 `127.0.0.1:0` 可拿到随机空闲端口（桌面端用，避免端口冲突）。
pub async fn start_server(cfg: ServerConfig) -> Result<u16, String> {
    let opts = SqliteConnectOptions::new()
        .filename(&cfg.database_path)
        .create_if_missing(true)
        .journal_mode(SqliteJournalMode::Wal)
        .foreign_keys(true);
    let db = SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(opts)
        .await
        .map_err(|e| format!("数据库连接失败: {e}"))?;

    // 内嵌迁移（幂等），避免依赖 sqlx-cli
    sqlx::raw_sql(include_str!("../migrations/0001_init.sql"))
        .execute(&db)
        .await
        .map_err(|e| format!("数据库迁移失败: {e}"))?;

    // 存量库补列：CREATE TABLE IF NOT EXISTS 不会给已存在的 favorites 表加 last_used_at
    let has_col: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM pragma_table_info('favorites') WHERE name = 'last_used_at'",
    )
    .fetch_one(&db)
    .await
    .unwrap_or(0);
    if has_col == 0 {
        sqlx::query("ALTER TABLE favorites ADD COLUMN last_used_at INTEGER NOT NULL DEFAULT 0")
            .execute(&db)
            .await
            .map_err(|e| format!("favorites 补列失败: {e}"))?;
    }

    // 存量库补列：conversations 的 pinned / folded（置顶、折叠的聊天）
    for col in ["pinned", "folded"] {
        let has: i64 = sqlx::query_scalar(&format!(
            "SELECT COUNT(*) FROM pragma_table_info('conversations') WHERE name = '{col}'"
        ))
        .fetch_one(&db)
        .await
        .unwrap_or(0);
        if has == 0 {
            sqlx::query(&format!(
                "ALTER TABLE conversations ADD COLUMN {col} INTEGER NOT NULL DEFAULT 0"
            ))
            .execute(&db)
            .await
            .map_err(|e| format!("conversations 补列失败: {e}"))?;
        }
    }

    // 存量库补列：personas 的 group_name（人格分组，空 = 不分组）
    let has_group: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM pragma_table_info('personas') WHERE name = 'group_name'",
    )
    .fetch_one(&db)
    .await
    .unwrap_or(0);
    if has_group == 0 {
        sqlx::query("ALTER TABLE personas ADD COLUMN group_name TEXT")
            .execute(&db)
            .await
            .map_err(|e| format!("personas 补列失败: {e}"))?;
    }

    // 存量库补列：messages 的 thinking（思考型模型的推理过程）
    let has_thinking: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM pragma_table_info('messages') WHERE name = 'thinking'",
    )
    .fetch_one(&db)
    .await
    .unwrap_or(0);
    if has_thinking == 0 {
        sqlx::query("ALTER TABLE messages ADD COLUMN thinking TEXT NOT NULL DEFAULT ''")
            .execute(&db)
            .await
            .map_err(|e| format!("messages 补列失败: {e}"))?;
    }

    // 存量库补列：messages 的 attachments（消息附件：图片 dataURL / 文本内容）
    let has_attachments: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM pragma_table_info('messages') WHERE name = 'attachments'",
    )
    .fetch_one(&db)
    .await
    .unwrap_or(0);
    if has_attachments == 0 {
        sqlx::query("ALTER TABLE messages ADD COLUMN attachments TEXT")
            .execute(&db)
            .await
            .map_err(|e| format!("messages attachments 补列失败: {e}"))?;
    }

    let state = AppState {
        db,
        jwt_secret: cfg.jwt_secret,
    };

    let auth_routes = axum::Router::new()
        .route("/register", axum::routing::post(auth::register))
        .route("/login", axum::routing::post(auth::login))
        .route("/me", axum::routing::get(auth::me));

    let api = axum::Router::new()
        .nest("/auth", auth_routes)
        .route(
            "/personas",
            axum::routing::get(routes::list_personas).post(routes::upsert_persona),
        )
        .route(
            "/personas/{id}",
            axum::routing::put(routes::update_persona).delete(routes::delete_persona),
        )
        .route(
            "/conversations",
            axum::routing::get(routes::list_conversations).post(routes::upsert_conversation),
        )
        .route(
            "/conversations/{id}",
            axum::routing::put(routes::update_conversation).delete(routes::delete_conversation),
        )
        .route(
            "/conversations/{id}/messages",
            axum::routing::get(routes::list_messages),
        )
        .route(
            "/messages",
            axum::routing::post(routes::upsert_message),
        )
        .route(
            "/messages/{id}",
            axum::routing::delete(routes::delete_message),
        )
        .route(
            "/providers",
            axum::routing::get(routes::list_providers).post(routes::upsert_provider),
        )
        .route(
            "/providers/{id}",
            axum::routing::put(routes::update_provider).delete(routes::delete_provider),
        )
        .route(
            "/settings",
            axum::routing::get(routes::get_settings).put(routes::put_settings),
        )
        .route(
            "/favorites",
            axum::routing::get(routes::list_favorites).post(routes::upsert_favorite),
        )
        .route(
            "/favorites/{id}",
            axum::routing::delete(routes::delete_favorite),
        )
        .route("/chat", axum::routing::post(llm::chat))
        .route("/chat/test", axum::routing::post(llm::chat_test))
        .route("/providers/{id}/models", axum::routing::get(llm::provider_models))
        .with_state(state);

    let app = axum::Router::new()
        .nest("/api", api)
        // 方舟透传：桌面端没有 vite 代理，浏览器直连方舟有 CORS 限制
        .route("/ark/{*path}", axum::routing::any(ark::ark_proxy))
        .layer(CorsLayer::permissive()) // dev 便于前端直连调试；桌面端跨源（tauri://localhost）也依赖它
        .layer(TraceLayer::new_for_http());

    let listener = tokio::net::TcpListener::bind(&cfg.listen_addr)
        .await
        .map_err(|e| format!("端口绑定失败（{}）: {e}", cfg.listen_addr))?;
    let port = listener
        .local_addr()
        .map_err(|e| format!("获取监听端口失败: {e}"))?
        .port();

    tokio::spawn(async move {
        if let Err(e) = axum::serve(listener, app).await {
            tracing::error!("MindVerse server 异常退出: {e}");
        }
    });
    Ok(port)
}
