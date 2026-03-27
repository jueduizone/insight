package models

import (
	"github.com/lib/pq"
	"gorm.io/gorm"
)

type User struct {
	gorm.Model
	Email         string         `gorm:"unique;not null" json:"email"`
	Username      string         `json:"username"`
	Intro         string         `json:"intro"`
	Avatar        string         `json:"avatar"`
	Github           string         `json:"github"`
	Twitter          string         `json:"twitter"`
	Wechat           string         `json:"wechat"`
	Telegram         string         `json:"telegram"`
	ExistingProjects string         `json:"existing_projects"`
	Uid              uint           `json:"-"` // OAUTH
	WalletAddress string         `json:"wallet_address"`
	Web3InsightId string         `json:"web3insight_id"`
	Tags          pq.StringArray `gorm:"type:text[]" json:"tags"`
	Group         string         `json:"group" gorm:"default:normal"`
	GithubStats   []byte         `gorm:"type:jsonb" json:"github_stats"`
	TwitterStats  []byte         `gorm:"type:jsonb" json:"twitter_stats"`
	Notes         string         `json:"notes"`
	Role          string         `json:"role" gorm:"default:admin"`
	PasswordHash  string         `json:"-"`
}

func GetUserByUid(uid uint) (*User, error) {
	var u User
	if err := db.Where("uid = ?", uid).First(&u).Error; err != nil {
		return nil, err
	}
	return &u, nil
}

func GetUserById(id uint) (*User, error) {
	var u User
	if err := db.Where("id = ?", id).First(&u).Error; err != nil {
		return nil, err
	}
	return &u, nil
}

func CreateUser(u *User) error {
	return db.Create(u).Error
}

func UpdateUser(u *User) error {
	if err := db.Save(u).Error; err != nil {
		return err
	}
	return nil
}

func GetUserByEmail(email string) (*User, error) {
	var u User
	if err := db.Where("email = ?", email).First(&u).Error; err != nil {
		return &u, err
	}
	return &u, nil
}

// UserQueryFilter 用户查询过滤器
type UserQueryFilter struct {
	Page     int    `json:"page" form:"page"`           // 页码，默认1
	PageSize int    `json:"page_size" form:"page_size"` // 每页数量，默认10
	Username string `json:"username" form:"username"`   // 用户名模糊查询
}

// QueryUsers 查询用户列表
func QueryUsers(filter UserQueryFilter) ([]User, int64, error) {
	var users []User
	var total int64

	query := db.Model(&User{}).Select("id, created_at, updated_at, email, username, intro, avatar, github, twitter, wechat, telegram, existing_projects, wallet_address, web3insight_id, tags, \"group\", notes, role")

	// 用户名模糊查询
	if filter.Username != "" {
		likePattern := "%" + filter.Username + "%"
		query = query.Where("username ILIKE ?", likePattern)
	}

	// 统计总数
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	// 设置分页默认值
	if filter.Page < 1 {
		filter.Page = 1
	}
	if filter.PageSize <= 0 {
		filter.PageSize = 10
	}

	// 计算偏移量
	offset := (filter.Page - 1) * filter.PageSize

	// 执行查询
	err := query.Offset(offset).Limit(filter.PageSize).Find(&users).Error
	return users, total, err
}
