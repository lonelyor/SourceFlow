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

type Bazaar struct {
	Trust                bool   `json:"trust"`
	PluginDisabled       bool   `json:"pluginDisabled"`
	PetalDisabled        bool   `json:"petalDisabled,omitempty"`
	BazaarHash           string `json:"bazaarHash"`
	BazaarStageBaseURL   string `json:"bazaarStageBaseURL"`
	BazaarPackageBaseURL string `json:"bazaarPackageBaseURL"`
	BazaarStatBaseURL    string `json:"bazaarStatBaseURL"`
	BazaarReadmeCDNURL   string `json:"bazaarReadmeCDNBaseURL"`
	BazaarVersionInfoURL string `json:"bazaarVersionInfoURL"`
}

func NewBazaar() *Bazaar {
	return &Bazaar{
		Trust:          false,
		PluginDisabled: false,
		PetalDisabled:  false,
	}
}

func (bazaar *Bazaar) Normalize() {
	if nil == bazaar {
		return
	}
	if bazaar.PetalDisabled && !bazaar.PluginDisabled {
		bazaar.PluginDisabled = true
	}
	bazaar.PetalDisabled = bazaar.PluginDisabled
}
