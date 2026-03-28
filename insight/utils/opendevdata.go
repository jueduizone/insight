package utils

import (
	"encoding/json"
	"log"
	"os"
	"strings"
	"sync"
	"sync/atomic"
)

type MonadDevRecord struct {
	Login         string  `json:"login"`
	Name          string  `json:"name"`
	GhLocation    string  `json:"gh_location"`
	MonadCommits  float64 `json:"monad_commits"`
	Country       string  `json:"country"`
	FormattedAddr string  `json:"formatted_address"`
	Lat           float64 `json:"lat"`
	Lng           float64 `json:"lng"`
	IsChinese     bool    `json:"is_chinese"`
}

var (
	monadDevIndex atomic.Pointer[map[string]*MonadDevRecord]
	monadLoadOnce sync.Once
	monadLoadMu   sync.Mutex
)

func loadMonadDevIndex() map[string]*MonadDevRecord {
	// 如果已加载且非空，直接返回
	if p := monadDevIndex.Load(); p != nil && len(*p) > 0 {
		return *p
	}

	// 加锁防并发重复加载
	monadLoadMu.Lock()
	defer monadLoadMu.Unlock()

	// double-check
	if p := monadDevIndex.Load(); p != nil && len(*p) > 0 {
		return *p
	}

	paths := []string{
		"data/monad_devs.json",
		"./data/monad_devs.json",
		"/root/insight/insight/data/monad_devs.json",
		"/home/bre/insight/insight/data/monad_devs.json",
	}

	var data []byte
	var loadedPath string
	for _, p := range paths {
		var err error
		data, err = os.ReadFile(p)
		if err == nil {
			loadedPath = p
			break
		}
	}

	if loadedPath == "" {
		log.Printf("[opendevdata] WARNING: monad_devs.json not found in any path")
		empty := make(map[string]*MonadDevRecord)
		// 不存储空 map，下次还会重试
		return empty
	}

	var records []MonadDevRecord
	if err := json.Unmarshal(data, &records); err != nil {
		log.Printf("[opendevdata] WARNING: failed to parse monad_devs.json: %v", err)
		empty := make(map[string]*MonadDevRecord)
		return empty
	}

	idx := make(map[string]*MonadDevRecord, len(records))
	for i := range records {
		key := strings.ToLower(records[i].Login)
		idx[key] = &records[i]
	}
	monadDevIndex.Store(&idx)
	log.Printf("[opendevdata] loaded %d Monad dev records from %s", len(idx), loadedPath)
	return idx
}

// LookupMonadDev 根据 GitHub login 查 Monad 生态贡献数据
func LookupMonadDev(login string) *MonadDevRecord {
	idx := loadMonadDevIndex()
	return idx[strings.ToLower(login)]
}

// IsChineseDeveloper 判断开发者是否为华语地区
func IsChineseDeveloper(githubLocation string, country string) bool {
	chineseCountries := []string{"china", "hong kong", "taiwan", "macau", "cn", "hk", "tw"}
	chineseKeywords := []string{"china", "beijing", "shanghai", "shenzhen", "guangzhou",
		"hangzhou", "chengdu", "wuhan", "nanjing", "suzhou", "hong kong", "taiwan",
		"中国", "北京", "上海", "深圳", "广州", "杭州", "成都", "武汉"}

	loc := strings.ToLower(githubLocation)
	ctry := strings.ToLower(country)

	for _, c := range chineseCountries {
		if ctry == c {
			return true
		}
	}
	for _, kw := range chineseKeywords {
		if strings.Contains(loc, kw) {
			return true
		}
	}
	return false
}

