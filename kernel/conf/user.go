// SourceFlow - Make knowledge flow
// Copyright (c) 2020-present, SourceFlow contributors
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

package conf

const (
	userSourceFlowProExpireTimeKey         = "userSourceFlowProExpireTime"
	userSourceFlowRepoSizeKey              = "userSourceFlowRepoSize"
	userSourceFlowPointExchangeRepoSizeKey = "userSourceFlowPointExchangeRepoSize"
	userSourceFlowAssetSizeKey             = "userSourceFlowAssetSize"
	userSourceFlowSubscriptionPlanKey      = "userSourceFlowSubscriptionPlan"
	userSourceFlowSubscriptionStatusKey    = "userSourceFlowSubscriptionStatus"
	userSourceFlowSubscriptionTypeKey      = "userSourceFlowSubscriptionType"
	userSourceFlowOneTimePayStatusKey      = "userSourceFlowOneTimePayStatus"
)

type User struct {
	UserId                              string       `json:"userId"`
	UserName                            string       `json:"userName"`
	UserAvatarURL                       string       `json:"userAvatarURL"`
	UserHomeBImgURL                     string       `json:"userHomeBImgURL"`
	UserTitles                          []*UserTitle `json:"userTitles"`
	UserIntro                           string       `json:"userIntro"`
	UserNickname                        string       `json:"userNickname"`
	UserCreateTime                      string       `json:"userCreateTime"`
	UserSourceFlowProExpireTime         float64      `json:"userSourceFlowProExpireTime"`
	UserToken                           string       `json:"userToken"`
	UserTokenExpireTime                 string       `json:"userTokenExpireTime"`
	UserSourceFlowRepoSize              float64      `json:"userSourceFlowRepoSize"`
	UserSourceFlowPointExchangeRepoSize float64      `json:"userSourceFlowPointExchangeRepoSize"`
	UserSourceFlowAssetSize             float64      `json:"userSourceFlowAssetSize"`
	UserTrafficUpload                   float64      `json:"userTrafficUpload"`
	UserTrafficDownload                 float64      `json:"userTrafficDownload"`
	UserTrafficAPIGet                   float64      `json:"userTrafficAPIGet"`
	UserTrafficAPIPut                   float64      `json:"userTrafficAPIPut"`
	UserTrafficTime                     float64      `json:"userTrafficTime"`
	UserSourceFlowSubscriptionPlan      float64      `json:"userSourceFlowSubscriptionPlan"`   // -1：未订阅，0：标准订阅，1：教育订阅，2：试用
	UserSourceFlowSubscriptionStatus    float64      `json:"userSourceFlowSubscriptionStatus"` // -1：未订阅，0：订阅可用，1：订阅封禁，2：订阅过期
	UserSourceFlowSubscriptionType      float64      `json:"userSourceFlowSubscriptionType"`   // 0 年付；1 终生；2 月付
	UserSourceFlowOneTimePayStatus      float64      `json:"userSourceFlowOneTimePayStatus"`   // 0 未付费；1 已付费
}

type UserTitle struct {
	Name string `json:"name"`
	Desc string `json:"desc"`
	Icon string `json:"icon"`
}

func (user *User) GetCloudRepoAvailableSize() int64 {
	return int64(user.UserSourceFlowRepoSize - user.UserSourceFlowAssetSize)
}
