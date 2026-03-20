package model

import (
	_ "embed"
	"encoding/json"
	"sync"
)

//go:embed activity_taxonomy.json
var activityTaxonomyJSON []byte

type ActivityTaxonomyEntry struct {
	ID    int    `json:"id"`
	Name  string `json:"name"`
	Label string `json:"label"`
}

var (
	activityTaxonomyOnce sync.Once
	activityTaxonomy     []ActivityTaxonomyEntry
)

func ActivityTaxonomy() []ActivityTaxonomyEntry {
	activityTaxonomyOnce.Do(func() {
		_ = json.Unmarshal(activityTaxonomyJSON, &activityTaxonomy)
	})
	out := make([]ActivityTaxonomyEntry, len(activityTaxonomy))
	copy(out, activityTaxonomy)
	return out
}
