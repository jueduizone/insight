package utils

import (
	"encoding/json"
	"log"
	"os"
	"strings"
	"sync"
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
	monadDevIndex map[string]*MonadDevRecord
	monadOnce     sync.Once
)

func loadMonadDevIndex() map[string]*MonadDevRecord {
	monadOnce.Do(func() {
		monadDevIndex = make(map[string]*MonadDevRecord)
		// 尝试多个路径
		paths := []string{"data/monad_devs.json", "./data/monad_devs.json", "/root/insight/insight/data/monad_devs.json"}
		var data []byte
		var err error
		for _, p := range paths {
			data, err = os.ReadFile(p)
			if err == nil {
				log.Printf("[opendevdata] loaded monad_devs.json from %s", p)
				break
			}
		}
		if err != nil {
			log.Printf("[opendevdata] WARNING: could not load monad_devs.json: %v", err)
			return
		}
		var records []MonadDevRecord
		if err := json.Unmarshal(data, &records); err != nil {
			log.Printf("[opendevdata] WARNING: failed to parse monad_devs.json: %v", err)
			return
		}
		for i := range records {
			key := strings.ToLower(records[i].Login)
			monadDevIndex[key] = &records[i]
		}
		log.Printf("[opendevdata] loaded %d Monad dev records", len(monadDevIndex))
	})
	return monadDevIndex
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

