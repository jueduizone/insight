package models

import (
	"github.com/lib/pq"
	"gorm.io/gorm"
)

type Project struct {
	gorm.Model
	Name        string         `json:"name"`
	Description string         `json:"description"`
	Github      string         `json:"github"`
	Site        string         `json:"site"`
	CoverImg    string         `json:"cover_image"`
	Tags        pq.StringArray `gorm:"type:text[]" json:"tags"`
	EventID     uint           `json:"event_id"`
	TeamName    string         `json:"team_name"`
	Members     string         `json:"members"`
	Score       float64        `json:"score"`
	Scores      []byte         `gorm:"type:jsonb" json:"scores"`
	Rank        int            `json:"rank"`
	Status      string         `json:"status"`
	AwardLevel  string         `json:"award_level"`
}

// ProjectFilter 项目查询过滤器
type ProjectFilter struct {
	Page     int    `json:"page" form:"page"`           // 页码，默认1
	PageSize int    `json:"page_size" form:"page_size"` // 每页数量，默认10
	Keyword  string `json:"keyword" form:"keyword"`     // 关键字模糊查询（名称、描述）
	Tag      string `json:"tag" form:"tag"`             // 标签查询
}

// CreateProject 创建项目
func CreateProject(project *Project) error {
	return db.Create(project).Error
}

// GetProjectByID 根据ID获取项目
func GetProjectByID(id uint) (*Project, error) {
	var project Project
	if err := db.First(&project, id).Error; err != nil {
		return nil, err
	}
	return &project, nil
}

// UpdateProject 更新项目
func UpdateProject(project *Project) error {
	return db.Save(project).Error
}

// DeleteProject 删除项目
func DeleteProject(id uint) error {
	return db.Delete(&Project{}, id).Error
}

// GetProjectByNameAndEventID 根据名称和活动ID查询项目（用于dedup）
func GetProjectByNameAndEventID(name string, eventID uint) (*Project, error) {
	var project Project
	query := db.Where("name = ?", name)
	if eventID > 0 {
		query = query.Where("event_id = ?", eventID)
	}
	if err := query.First(&project).Error; err != nil {
		return nil, err
	}
	return &project, nil
}

// QueryProjects 查询项目列表（带分页和筛选）
func QueryProjects(filter ProjectFilter) ([]Project, int64, error) {
	var projects []Project
	var total int64

	query := db.Model(&Project{})

	// 关键字模糊查询（名称、描述）
	if filter.Keyword != "" {
		likePattern := "%" + filter.Keyword + "%"
		query = query.Where("name ILIKE ? OR description ILIKE ?", likePattern, likePattern)
	}

	// 标签查询
	if filter.Tag != "" {
		query = query.Where("? = ANY(tags)", filter.Tag)
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

	// 按创建时间倒序排列
	query = query.Order("created_at DESC")

	// 计算偏移量并查询
	offset := (filter.Page - 1) * filter.PageSize
	err := query.Offset(offset).Limit(filter.PageSize).Find(&projects).Error

	return projects, total, err
}

// GetAllProjects 获取所有项目（不分页）
func GetAllProjects() ([]Project, error) {
	var projects []Project
	err := db.Order("created_at DESC").Find(&projects).Error
	return projects, err
}

// GetProjectsByTag 根据标签获取项目
func GetProjectsByTag(tag string) ([]Project, error) {
	var projects []Project
	err := db.Where("? = ANY(tags)", tag).
		Order("created_at DESC").
		Find(&projects).Error
	return projects, err
}

func CountProjects() (int64, error) {
	var count int64
	return count, db.Model(&Project{}).Count(&count).Error
}
