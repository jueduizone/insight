package models

import (
	"time"

	"github.com/lib/pq"
	"gorm.io/gorm"
)

// Migration SQL (run manually):
//   ALTER TABLE users ADD COLUMN projects_raw TEXT NOT NULL DEFAULT '';
//   ALTER TABLE users ADD COLUMN projects_cleaned BOOLEAN NOT NULL DEFAULT FALSE;
//   ALTER TABLE users ADD COLUMN projects_cleaned_at TIMESTAMP;

type User struct {
	gorm.Model        `json:"-"`
	ID                uint           `gorm:"primarykey" json:"id"`
	CreatedAt         time.Time      `json:"created_at"`
	UpdatedAt         time.Time      `json:"updated_at"`
	Email             string         `gorm:"unique;not null" json:"email"`
	Username          string         `json:"username"`
	Intro             string         `json:"intro"`
	MonadExperience   string         `json:"monad_experience"`
	Avatar            string         `json:"avatar"`
	Github            string         `json:"github"`
	Twitter           string         `json:"twitter"`
	Wechat            string         `json:"wechat"`
	Telegram          string         `json:"telegram"`
	ExistingProjects  string         `json:"existing_projects"`
	Uid               uint           `json:"-"` // OAUTH
	WalletAddress     string         `json:"wallet_address"`
	Web3InsightId     string         `json:"web3insight_id"`
	Tags              pq.StringArray `gorm:"type:text[]" json:"tags"`
	Group             string         `json:"group" gorm:"default:normal"`
	GithubStats       []byte         `gorm:"type:jsonb" json:"github_stats"`
	TwitterStats      []byte         `gorm:"type:jsonb" json:"twitter_stats"`
	Notes             string         `json:"notes"`
	Role              string         `json:"role" gorm:"default:member"`
	PasswordHash      string         `json:"-"`
	ActivityScore     int            `json:"activity_score"`
	FirstJoinedAt     *time.Time     `gorm:"column:first_joined_at" json:"first_joined_at"`
	ProjectsRaw       string         `gorm:"column:projects_raw" json:"projects_raw"`
	ProjectsCleaned   bool           `gorm:"column:projects_cleaned;default:false" json:"projects_cleaned"`
	ProjectsCleanedAt *time.Time     `gorm:"column:projects_cleaned_at" json:"projects_cleaned_at"`
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
	Role     string `json:"role" form:"role"`           // 角色过滤
}

// QueryUsers 查询用户列表
func QueryUsers(filter UserQueryFilter) ([]User, int64, error) {
	var users []User
	var total int64

	query := db.Model(&User{}).Select("id, created_at, updated_at, email, username, intro, monad_experience, avatar, github, twitter, wechat, telegram, existing_projects, wallet_address, web3insight_id, tags, \"group\", notes, role, activity_score, first_joined_at, projects_raw, projects_cleaned, projects_cleaned_at, github_stats")

	// 用户名模糊查询
	if filter.Username != "" {
		likePattern := "%" + filter.Username + "%"
		query = query.Where("username ILIKE ?", likePattern)
	}

	if filter.Role != "" {
		query = query.Where("role = ?", filter.Role)
	} else {
		// 默认排除管理员账号，只显示开发者
		query = query.Where("role NOT IN ?", []string{"admin", "super_admin"})
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

func GetAllUsersWithGithub() ([]User, error) {
	var users []User
	err := db.Where("github != ''").Select("id, github, username").Find(&users).Error
	return users, err
}

func UpdateUserGithubStats(userID uint, stats []byte) error {
	return db.Model(&User{}).Where("id = ?", userID).Update("github_stats", stats).Error
}

func GetAllUsersForScore() ([]User, error) {
	var users []User
	err := db.Select("id, github, github_stats, web3insight_id, notes").Find(&users).Error
	return users, err
}

func UpdateUserActivityScore(userID uint, score int) error {
	return db.Model(&User{}).Where("id = ?", userID).Update("activity_score", score).Error
}

func CountUsers() (int64, error) {
	var count int64
	return count, db.Model(&User{}).Where("role = ?", "member").Count(&count).Error
}

func CountUsersCreatedAfter(t time.Time) (int64, error) {
	var count int64
	return count, db.Model(&User{}).Where("role = ? AND created_at >= ?", "member", t).Count(&count).Error
}

func CountActiveUsers() (int64, error) {
	var count int64
	return count, db.Model(&User{}).Where("role = ? AND activity_score > 0", "member").Count(&count).Error
}

// GetUsersForProjectsCleaning returns users that have projects_raw set but not yet cleaned.
func GetUsersForProjectsCleaning(limit int) ([]User, error) {
	var users []User
	err := db.Where("projects_cleaned = false AND projects_raw != ''").
		Select("id, projects_raw").
		Limit(limit).Find(&users).Error
	return users, err
}

// MarkProjectsCleaned updates a user's existing_projects with the cleaned result and marks it as done.
func MarkProjectsCleaned(userID uint, cleanedProjects string, cleanedAt time.Time) error {
	return db.Model(&User{}).Where("id = ?", userID).Updates(map[string]interface{}{
		"existing_projects":   cleanedProjects,
		"projects_cleaned":    true,
		"projects_cleaned_at": cleanedAt,
	}).Error
}

// GetUsersWithGithubNoWeb3Insight returns users that have github but no web3insight_id
func GetUsersWithGithubNoWeb3Insight(limit int) ([]User, error) {
	var users []User
	err := db.Where("github != '' AND (web3insight_id IS NULL OR web3insight_id = '') AND role = 'member'").
		Select("id, github, username, web3insight_id, github_stats").
		Limit(limit).Find(&users).Error
	return users, err
}

// GetUsersWithoutProfile returns member users with activity records but no notes (profile)
func GetUsersWithoutProfile(limit int) ([]User, error) {
	var users []User
	err := db.Where("role = 'member' AND (notes IS NULL OR notes = '') AND id IN (SELECT DISTINCT user_id FROM activity_records)").
		Select("id, username, github, intro, monad_experience, existing_projects, notes").
		Limit(limit).Find(&users).Error
	return users, err
}

func CountUsersWithWeb3Insight() (int64, error) {
	var count int64
	return count, db.Model(&User{}).Where("role = 'member' AND web3insight_id IS NOT NULL AND web3insight_id != ''").Count(&count).Error
}

func CountUsersWithGithub() (int64, error) {
	var count int64
	return count, db.Model(&User{}).Where("role = 'member' AND github != ''").Count(&count).Error
}

func CountUsersWithProfile() (int64, error) {
	var count int64
	return count, db.Model(&User{}).Where("role = 'member' AND notes IS NOT NULL AND notes != ''").Count(&count).Error
}
