package models

import "time"

type ActivityEvent struct {
	ID          uint      `gorm:"primarykey" json:"id"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
	Name        string    `json:"name"`
	Type        string    `json:"type"`
	Platform    string    `json:"platform"`
	StartDate   time.Time `json:"start_date"`
	EndDate     time.Time `json:"end_date"`
	Description string    `json:"description"`
}

type ActivityRecord struct {
	ID        uint      `gorm:"primarykey" json:"id"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
	UserID    uint      `json:"user_id"`
	EventID   uint      `json:"event_id"`
	Role      string    `json:"role"`
	Award     string    `json:"award"`
	Status    string    `json:"status"`
	ExtraData []byte    `gorm:"type:jsonb" json:"extra_data"`
	User      User      `gorm:"foreignKey:UserID" json:"user,omitempty"`
	Event     ActivityEvent `gorm:"foreignKey:EventID" json:"event,omitempty"`
}

// ActivityEventFilter 活动查询过滤器
type ActivityEventFilter struct {
	Page     int    `form:"page"`
	PageSize int    `form:"page_size"`
	Name     string `form:"name"`
}

func CreateActivityEvent(e *ActivityEvent) error {
	return db.Create(e).Error
}

func GetActivityEventByID(id uint) (*ActivityEvent, error) {
	var e ActivityEvent
	if err := db.First(&e, id).Error; err != nil {
		return nil, err
	}
	return &e, nil
}

func QueryActivityEvents(filter ActivityEventFilter) ([]ActivityEvent, int64, error) {
	var events []ActivityEvent
	var total int64

	query := db.Model(&ActivityEvent{})
	if filter.Name != "" {
		query = query.Where("name ILIKE ?", "%"+filter.Name+"%")
	}

	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	if filter.Page < 1 {
		filter.Page = 1
	}
	if filter.PageSize <= 0 {
		filter.PageSize = 10
	}

	offset := (filter.Page - 1) * filter.PageSize
	err := query.Order("created_at DESC").Offset(offset).Limit(filter.PageSize).Find(&events).Error
	return events, total, err
}

func CreateActivityRecord(r *ActivityRecord) error {
	return db.Create(r).Error
}

func GetRecordsByEventID(eventID uint, page, pageSize int) ([]ActivityRecord, int64, error) {
	var records []ActivityRecord
	var total int64

	query := db.Model(&ActivityRecord{}).Where("event_id = ?", eventID)
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	if page < 1 {
		page = 1
	}
	if pageSize <= 0 {
		pageSize = 10
	}

	offset := (page - 1) * pageSize
	err := query.Preload("User").Offset(offset).Limit(pageSize).Find(&records).Error
	return records, total, err
}

func GetRecordsByUserID(userID uint) ([]ActivityRecord, error) {
	var records []ActivityRecord
	err := db.Where("user_id = ?", userID).Preload("Event").Find(&records).Error
	return records, err
}

func GetUserByGithub(github string) (*User, error) {
	var u User
	if err := db.Where("github = ?", github).First(&u).Error; err != nil {
		return nil, err
	}
	return &u, nil
}

func GetUserByWalletAddress(wallet string) (*User, error) {
	var u User
	if err := db.Where("wallet_address = ?", wallet).First(&u).Error; err != nil {
		return nil, err
	}
	return &u, nil
}

func UpsertActivityRecord(record *ActivityRecord) (created bool, err error) {
	var existing ActivityRecord
	result := db.Where("user_id = ? AND event_id = ?", record.UserID, record.EventID).First(&existing)
	if result.Error == nil {
		// Record exists — update non-empty fields
		if record.Award != "" {
			existing.Award = record.Award
		}
		if record.Role != "" {
			existing.Role = record.Role
		}
		if record.Status != "" {
			existing.Status = record.Status
		}
		if len(record.ExtraData) > 0 {
			existing.ExtraData = record.ExtraData
		}
		return false, db.Save(&existing).Error
	}
	// No existing record — create new
	return true, db.Create(record).Error
}

func UpdateActivityEvent(event *ActivityEvent) error {
	return db.Save(event).Error
}

func DeleteActivityEvent(id uint) error {
	return db.Delete(&ActivityEvent{}, id).Error
}

func GetActivityRecordCountByEventID(eventID uint) (int64, error) {
	var count int64
	err := db.Model(&ActivityRecord{}).Where("event_id = ?", eventID).Count(&count).Error
	return count, err
}

func CountActivityRecordsByUserID(userID uint) (int64, error) {
	var count int64
	return count, db.Model(&ActivityRecord{}).Where("user_id = ?", userID).Count(&count).Error
}

func CountEvents() (int64, error) {
	var count int64
	return count, db.Model(&ActivityEvent{}).Count(&count).Error
}

func CountActivityRecords() (int64, error) {
	var count int64
	return count, db.Model(&ActivityRecord{}).Count(&count).Error
}
