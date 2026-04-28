package controllers

import (
	"insight/models"
	"time"
)

// login

type LoginRequest struct {
	Email    string `json:"email" binding:"required"`
	Username string `json:"username"`
	Password string `json:"password" binding:"required"`
}

type LoginResponse struct {
	models.User
	Permissions []string `json:"permissions"`
	Token       string   `json:"token"`
}

// OAUTH
type SignRequest struct {
	Code string `json:"code" binding:"required"`
}

type SignResponse struct {
	Token string `json:"token"`
}

type AccessTokenRequest struct {
	ClientId     string `json:"client_id"`
	ClientSecret string `json:"client_secret"`
	Code         string `json:"code"`
}

// 定义响应的结构体
type AccessTokenResponse struct {
	Status int `json:"status"`
	Code   int `json:"code"`
	Data   struct {
		Token string `json:"token"`
	} `json:"data"`
	Time    int64  `json:"time"`
	Message string `json:"message"`
	ID      string `json:"id"`
}

// 定义数据部分的结构体
type UserData struct {
	Uid      uint   `json:"uid"`
	Avatar   string `json:"avatar"`
	UserName string `json:"user_name"`
	Email    string `json:"email"`
	Github   string `json:"github"`
}

// 定义顶层响应的结构体
type GetUserResponse struct {
	ID      string   `json:"id"`
	Status  int      `json:"status"`
	Code    int      `json:"code"`
	Data    UserData `json:"data"`
	Time    int64    `json:"time"`
	Message string   `json:"message"`
}

// UserListResponse 用户列表返回结构体
type UserListResponse struct {
	Users    []models.User `json:"users"`
	Total    int64         `json:"total"`
	Page     int           `json:"page"`
	PageSize int           `json:"page_size"`
}

type UserCreateRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Username string `json:"username" binding:"required,min=2,max=50"`
	Avatar   string `json:"avatar"`
	Github   string `json:"github"`
	Twitter  string `json:"twitter"`
}

type AdminCreateRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Username string `json:"username" binding:"required,min=2,max=50"`
	Password string `json:"password" binding:"required,min=6"`
}

type AdminUpdateRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Username string `json:"username" binding:"required,min=2,max=50"`
	Role     string `json:"role" binding:"required,oneof=admin super_admin"`
}

type AdminResetPasswordRequest struct {
	Password string `json:"password" binding:"required,min=6"`
}

// Project
type CreateProjectRequest struct {
	Name        string   `json:"name" binding:"required,min=2,max=100"`
	Description string   `json:"description" binding:"required,min=10"`
	Github      string   `json:"github"`
	Site        string   `json:"site"`
	CoverImg    string   `json:"cover_image"`
	Tags        []string `json:"tags"`
}

// ProjectUpdateRequest 更新项目请求结构体
type UpdateProjectRequest struct {
	Name        string   `json:"name" binding:"min=2,max=100"`
	Description string   `json:"description" binding:"min=10"`
	Github      string   `json:"github"`
	Site        string   `json:"site"`
	CoverImg    string   `json:"cover_image"`
	Tags        []string `json:"tags"`
}

// ProjectListResponse 项目列表返回结构体
type ProjectListResponse struct {
	Projects []models.Project `json:"projects"`
	Total    int64            `json:"total"`
	Page     int              `json:"page"`
	PageSize int              `json:"page_size"`
}

// Activity
type CreateEventRequest struct {
	Name        string    `json:"name" binding:"required"`
	Type        string    `json:"type"`
	Platform    string    `json:"platform"`
	StartDate   time.Time `json:"start_date"`
	EndDate     time.Time `json:"end_date"`
	Description string    `json:"description"`
}

type UpdateEventRequest struct {
	Name        string    `json:"name"`
	Type        string    `json:"type"`
	Platform    string    `json:"platform"`
	StartDate   time.Time `json:"start_date"`
	EndDate     time.Time `json:"end_date"`
	Description string    `json:"description"`
}

type ChangePasswordRequest struct {
	OldPassword string `json:"old_password" binding:"required"`
	NewPassword string `json:"new_password" binding:"required"`
}

// SuggestMapping
type SuggestMappingRequest struct {
	Columns []string `json:"columns" binding:"required"`
}

// OperationLog
type CreateLogRequest struct {
	TargetType string `json:"target_type" binding:"required"`
	TargetID   uint   `json:"target_id" binding:"required"`
	Content    string `json:"content" binding:"required"`
}
