package models

import (
	"insight/config"
)

var db = config.DB

func init() {
	db.AutoMigrate(&User{})
	db.AutoMigrate(&Project{})
	db.AutoMigrate(&ActivityEvent{})
	db.AutoMigrate(&ActivityRecord{})
	db.AutoMigrate(&OperationLog{})
}
