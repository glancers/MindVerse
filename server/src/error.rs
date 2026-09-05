use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde_json::json;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("{0}")]
    BadRequest(String),
    #[error("未认证或登录态已失效")]
    Unauthorized,
    #[error("{0}")]
    Conflict(String),
    #[error("资源不存在")]
    NotFound,
    #[error("服务器内部错误")]
    Internal,
}

impl From<sqlx::Error> for AppError {
    fn from(_: sqlx::Error) -> Self {
        // 数据库错误细节不外泄，只打日志由 tracing 层记录
        AppError::Internal
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, code) = match &self {
            AppError::BadRequest(_) => (StatusCode::BAD_REQUEST, "bad_request"),
            AppError::Unauthorized => (StatusCode::UNAUTHORIZED, "unauthorized"),
            AppError::Conflict(_) => (StatusCode::CONFLICT, "conflict"),
            AppError::NotFound => (StatusCode::NOT_FOUND, "not_found"),
            AppError::Internal => (StatusCode::INTERNAL_SERVER_ERROR, "internal"),
        };
        (status, Json(json!({"error": {"code": code, "message": self.to_string()}}))).into_response()
    }
}

pub type ApiResult<T> = Result<T, AppError>;
