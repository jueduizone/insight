package models

import (
	"time"
)

// EventFunnelItem represents an event with its participant count.
type EventFunnelItem struct {
	EventID   uint   `json:"event_id"`
	EventName string `json:"event_name"`
	EventType string `json:"event_type"`
	Platform  string `json:"platform"`
	Count     int64  `json:"count"`
}

// ContactCoverage holds contact field coverage statistics for member users.
type ContactCoverage struct {
	GithubCount   int64   `json:"github_count"`
	TwitterCount  int64   `json:"twitter_count"`
	TelegramCount int64   `json:"telegram_count"`
	TotalUsers    int64   `json:"total_users"`
	GithubPct     float64 `json:"github_pct"`
	TwitterPct    float64 `json:"twitter_pct"`
	TelegramPct   float64 `json:"telegram_pct"`
}

// ActivityBucket represents an activity score range with a user count.
type ActivityBucket struct {
	Range string `json:"range"`
	Count int64  `json:"count"`
}

// DailyCount holds a date string and a new-user count.
type DailyCount struct {
	Date  string `json:"date"`
	Count int64  `json:"count"`
}

// RetentionItem holds activation-rate statistics for a join cohort.
type RetentionItem struct {
	Period string  `json:"period"`
	Total  int64   `json:"total"`
	Active int64   `json:"active"`
	Rate   float64 `json:"rate"`
}

// GetEventFunnel returns all events with their participant counts, ordered by count desc.
func GetEventFunnel() ([]EventFunnelItem, error) {
	var items []EventFunnelItem
	err := db.Table("activity_events").
		Select("activity_events.id as event_id, activity_events.name as event_name, activity_events.type as event_type, activity_events.platform, COUNT(activity_records.id) as count").
		Joins("LEFT JOIN activity_records ON activity_records.event_id = activity_events.id").
		Group("activity_events.id, activity_events.name, activity_events.type, activity_events.platform").
		Order("count DESC").
		Scan(&items).Error
	if items == nil {
		items = []EventFunnelItem{}
	}
	return items, err
}

// GetContactCoverage returns contact field coverage statistics for member users.
func GetContactCoverage() (ContactCoverage, error) {
	var result ContactCoverage
	total, err := CountUsers()
	if err != nil {
		return result, err
	}
	result.TotalUsers = total
	db.Model(&User{}).Where("role = ? AND github != ''", "member").Count(&result.GithubCount)
	db.Model(&User{}).Where("role = ? AND twitter != ''", "member").Count(&result.TwitterCount)
	db.Model(&User{}).Where("role = ? AND (telegram != '' OR wechat != '')", "member").Count(&result.TelegramCount)
	if total > 0 {
		result.GithubPct = float64(result.GithubCount) / float64(total) * 100
		result.TwitterPct = float64(result.TwitterCount) / float64(total) * 100
		result.TelegramPct = float64(result.TelegramCount) / float64(total) * 100
	}
	return result, nil
}

// GetActivityDistribution returns activity score distribution across four buckets.
func GetActivityDistribution() ([]ActivityBucket, error) {
	buckets := []ActivityBucket{
		{Range: "0"},
		{Range: "1-30"},
		{Range: "31-60"},
		{Range: "61-100"},
	}
	db.Model(&User{}).Where("role = ? AND activity_score = 0", "member").Count(&buckets[0].Count)
	db.Model(&User{}).Where("role = ? AND activity_score >= 1 AND activity_score <= 30", "member").Count(&buckets[1].Count)
	db.Model(&User{}).Where("role = ? AND activity_score >= 31 AND activity_score <= 60", "member").Count(&buckets[2].Count)
	db.Model(&User{}).Where("role = ? AND activity_score > 60", "member").Count(&buckets[3].Count)
	return buckets, nil
}

// GetDailyNewUsers returns daily new-member counts between start and end.
func GetDailyNewUsers(start, end time.Time) ([]DailyCount, error) {
	var rows []struct {
		Date  string `gorm:"column:date"`
		Count int64  `gorm:"column:count"`
	}
	err := db.Model(&User{}).
		Select("TO_CHAR(created_at, 'YYYY-MM-DD') as date, COUNT(*) as count").
		Where("role = ? AND created_at >= ? AND created_at <= ?", "member", start, end).
		Group("date").
		Order("date ASC").
		Scan(&rows).Error
	result := make([]DailyCount, 0, len(rows))
	for _, r := range rows {
		result = append(result, DailyCount{Date: r.Date, Count: r.Count})
	}
	return result, err
}

// GetRetentionStats returns activation rates by join cohort (7, 8-14, 15-30 days ago).
func GetRetentionStats() ([]RetentionItem, error) {
	now := time.Now()
	type cohort struct {
		label string
		start time.Time
		end   time.Time
	}
	cohorts := []cohort{
		{"最近7天", now.AddDate(0, 0, -7), now},
		{"8-14天", now.AddDate(0, 0, -14), now.AddDate(0, 0, -7)},
		{"15-30天", now.AddDate(0, 0, -30), now.AddDate(0, 0, -14)},
	}
	items := make([]RetentionItem, 0, len(cohorts))
	for _, co := range cohorts {
		var total, active int64
		db.Model(&User{}).Where("role = ? AND created_at >= ? AND created_at < ?", "member", co.start, co.end).Count(&total)
		db.Model(&User{}).Where("role = ? AND created_at >= ? AND created_at < ? AND activity_score > 0", "member", co.start, co.end).Count(&active)
		rate := 0.0
		if total > 0 {
			rate = float64(active) / float64(total) * 100
		}
		items = append(items, RetentionItem{
			Period: co.label,
			Total:  total,
			Active: active,
			Rate:   rate,
		})
	}
	return items, nil
}
