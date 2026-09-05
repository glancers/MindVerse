use argon2::password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString};
use argon2::Argon2;
use axum::extract::{FromRequestParts, State};
use axum::http::request::Parts;
use axum::http::header::AUTHORIZATION;
use axum::Json;
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use sqlx::Row;

use crate::error::{ApiResult, AppError};
use crate::models::TokenOut;
use crate::{now_ms, AppState};

/// JWT 有效期：30 天（个人工具场景，避免频繁重登）
const TOKEN_TTL_SECS: i64 = 30 * 24 * 3600;

#[derive(Deserialize)]
pub struct Credentials {
    pub username: String,
    pub password: String,
}

#[derive(Serialize, Deserialize)]
struct Claims {
    sub: String,
    exp: usize,
}

/// 已认证用户（axum 提取器：校验 Bearer JWT）
pub struct AuthUser {
    pub user_id: String,
}

impl FromRequestParts<AppState> for AuthUser {
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self, Self::Rejection> {
        let token = parts
            .headers
            .get(AUTHORIZATION)
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.strip_prefix("Bearer "))
            .ok_or(AppError::Unauthorized)?;
        let claims = decode::<Claims>(
            token,
            &DecodingKey::from_secret(state.jwt_secret.as_bytes()),
            &Validation::default(),
        )
        .map_err(|_| AppError::Unauthorized)?
        .claims;
        Ok(AuthUser { user_id: claims.sub })
    }
}

fn hash_password(password: &str) -> String {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .expect("密码哈希失败")
        .to_string()
}

fn verify_password(hash: &str, password: &str) -> bool {
    PasswordHash::new(hash)
        .and_then(|parsed| Argon2::default().verify_password(password.as_bytes(), &parsed))
        .is_ok()
}

fn issue_token(state: &AppState, user_id: &str) -> String {
    let exp = (std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
        + TOKEN_TTL_SECS) as usize;
    encode(
        &Header::default(),
        &Claims {
            sub: user_id.to_string(),
            exp,
        },
        &EncodingKey::from_secret(state.jwt_secret.as_bytes()),
    )
    .expect("JWT 签发失败")
}

fn validate_credentials(cred: &Credentials) -> ApiResult<&Credentials> {
    let username = cred.username.trim();
    if !(2..=32).contains(&username.len()) {
        return Err(AppError::BadRequest("用户名长度需在 2–32 之间".into()));
    }
    if cred.password.len() < 6 {
        return Err(AppError::BadRequest("密码至少 6 位".into()));
    }
    Ok(cred)
}

pub async fn register(
    State(state): State<AppState>,
    Json(cred): Json<Credentials>,
) -> ApiResult<Json<TokenOut>> {
    validate_credentials(&cred)?;
    let username = cred.username.trim();

    let exists: bool =
        sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM users WHERE username = ?)")
            .bind(username)
            .fetch_one(&state.db)
            .await?;
    if exists {
        return Err(AppError::Conflict("用户名已被占用".into()));
    }

    let id = uuid::Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)")
        .bind(&id)
        .bind(username)
        .bind(hash_password(&cred.password))
        .bind(now_ms())
        .execute(&state.db)
        .await?;

    Ok(Json(TokenOut {
        token: issue_token(&state, &id),
        expires_in: TOKEN_TTL_SECS,
        user: crate::models::UserOut {
            id,
            username: username.to_string(),
        },
    }))
}

pub async fn login(
    State(state): State<AppState>,
    Json(cred): Json<Credentials>,
) -> ApiResult<Json<TokenOut>> {
    let username = cred.username.trim();
    let row = sqlx::query("SELECT id, password_hash FROM users WHERE username = ?")
        .bind(username)
        .fetch_optional(&state.db)
        .await?
        .ok_or(AppError::Unauthorized)?;

    let id: String = row.try_get("id").map_err(|_| AppError::Internal)?;
    let hash: String = row.try_get("password_hash").map_err(|_| AppError::Internal)?;
    if !verify_password(&hash, &cred.password) {
        return Err(AppError::Unauthorized);
    }

    Ok(Json(TokenOut {
        token: issue_token(&state, &id),
        expires_in: TOKEN_TTL_SECS,
        user: crate::models::UserOut {
            id,
            username: username.to_string(),
        },
    }))
}

pub async fn me(user: AuthUser, State(state): State<AppState>) -> ApiResult<Json<crate::models::UserOut>> {
    let row = sqlx::query("SELECT username FROM users WHERE id = ?")
        .bind(&user.user_id)
        .fetch_optional(&state.db)
        .await?
        .ok_or(AppError::Unauthorized)?;
    Ok(Json(crate::models::UserOut {
        id: user.user_id,
        username: row.try_get("username").map_err(|_| AppError::Internal)?,
    }))
}
