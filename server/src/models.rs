//! DTO 与前端 src/types/index.ts 严格对齐（camelCase）

use serde::{Deserialize, Serialize};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UserOut {
    pub id: String,
    pub username: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenOut {
    pub token: String,
    pub expires_in: i64,
    pub user: UserOut,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersonaDto {
    pub id: String,
    pub name: String,
    pub avatar: Option<String>,
    pub color: String,
    pub tagline: Option<String>,
    #[serde(default)]
    pub group: Option<String>,
    pub traits: Vec<String>,
    pub system_prompt: String,
    pub model_binding: Option<serde_json::Value>,
    pub is_preset: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationDto {
    pub id: String,
    #[serde(rename = "type")]
    pub conv_type: String,
    pub title: String,
    pub persona_ids: Vec<String>,
    pub host_persona_id: Option<String>,
    #[serde(default)]
    pub pinned: bool,
    #[serde(default)]
    pub folded: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageDto {
    pub id: String,
    pub conversation_id: String,
    pub role: String,
    pub sender_persona_id: Option<String>,
    pub content: String,
    #[serde(default)]
    pub thinking: Option<String>,
    /// 附件（图片 dataURL / 文本内容 / 其他元数据），与前端 MessageAttachment 对齐
    #[serde(default)]
    pub attachments: Option<Vec<serde_json::Value>>,
    pub created_at: i64,
    pub status: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderIn {
    pub id: String,
    #[serde(rename = "type")]
    pub provider_type: String,
    pub name: String,
    #[serde(rename = "baseURL")]
    pub base_url: String,
    /// 留空 = 更新时保持原 Key（服务器模式编辑不回显 Key）
    pub api_key: Option<String>,
    pub models: Vec<String>,
    pub default_model: String,
}

/// 响应用：永不包含 apiKey
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderOut {
    pub id: String,
    #[serde(rename = "type")]
    pub provider_type: String,
    pub name: String,
    #[serde(rename = "baseURL")]
    pub base_url: String,
    pub models: Vec<String>,
    pub default_model: String,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsDto {
    pub active_provider_id: String,
    pub active_model: String,
    pub default_rounds: i64,
}

impl Default for SettingsDto {
    fn default() -> Self {
        Self {
            active_provider_id: String::new(),
            active_model: String::new(),
            default_rounds: 3,
        }
    }
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FavoriteItemDto {
    pub message_id: String,
    pub role: String,
    pub sender_persona_id: Option<String>,
    pub sender_name: String,
    pub content: String,
    pub created_at: i64,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FavoriteDto {
    pub id: String,
    pub items: Vec<FavoriteItemDto>,
    pub conversation_id: String,
    pub conversation_title: String,
    pub created_at: i64,
    #[serde(default)]
    pub last_used_at: i64,
}

#[derive(Deserialize)]
pub struct MessageQuery {
    /// 增量拉取：只取 createdAt 大于该值的消息
    pub after: Option<i64>,
    pub limit: Option<i64>,
}
