package models

import "time"

type OperationLog struct {
	ID         uint      `gorm:"primarykey" json:"id"`
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
	TargetType string    `json:"target_type"`
	TargetID   uint      `json:"target_id"`
	AdminID    uint      `json:"admin_id"`
	Content    string    `json:"content"`
	Admin      User      `gorm:"foreignKey:AdminID" json:"admin,omitempty"`
}

func CreateOperationLog(log *OperationLog) error {
	return db.Create(log).Error
}

func GetOperationLogs(targetType string, targetID uint) ([]OperationLog, error) {
	var logs []OperationLog
	query := db.Model(&OperationLog{})
	if targetType != "" {
		query = query.Where("target_type = ?", targetType)
	}
	if targetID > 0 {
		query = query.Where("target_id = ?", targetID)
	}
	err := query.Preload("Admin").Order("created_at DESC").Find(&logs).Error
	return logs, err
}
