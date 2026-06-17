import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || '/api';

export class APIClient {
  constructor() {
    this.http = axios.create({
      baseURL: BASE_URL,
      timeout: 15000,
      headers: { 'Content-Type': 'application/json' },
    });

    // Request interceptor — attach token
    this.http.interceptors.request.use(config => {
      const token = localStorage.getItem('mla_token');
      if (token) config.headers.Authorization = `Bearer ${token}`;
      return config;
    });

    // Response interceptor — handle 401 auto-refresh
    this.http.interceptors.response.use(
      r => r,
      async err => {
        const orig = err.config;
        if (err.response?.status === 401 && !orig._retry) {
          orig._retry = true;
          try {
            const refresh = localStorage.getItem('mla_refresh');
            if (refresh) {
              const { data } = await axios.post(`${BASE_URL}/auth/refresh`, { refreshToken: refresh });
              localStorage.setItem('mla_token', data.token);
              localStorage.setItem('mla_refresh', data.refreshToken);
              orig.headers.Authorization = `Bearer ${data.token}`;
              return this.http(orig);
            }
          } catch { /* refresh failed */ }
          // Clear session
          localStorage.removeItem('mla_token');
          localStorage.removeItem('mla_refresh');
          window.MLA?.store?.clearUser();
        }
        return Promise.reject(err);
      }
    );
  }

  // ─── Auth ─────────────────────────────────────────────────────────────────
  async register(username, email, password)    { return (await this.http.post('/auth/register', { username, email, password })).data; }
  async login(identifier, password)             { return (await this.http.post('/auth/login', { identifier, password })).data; }
  async loginAsGuest()                          { return (await this.http.post('/auth/guest')).data; }
  async logout()                                { return (await this.http.post('/auth/logout')).data; }
  async getMe()                                 { return (await this.http.get('/auth/me')).data; }
  async forgotPassword(email)                   { return (await this.http.post('/auth/forgot-password', { email })).data; }
  async resetPassword(token, password)          { return (await this.http.post(`/auth/reset-password/${token}`, { password })).data; }
  async convertGuest(username, email, password) { return (await this.http.post('/auth/convert-guest', { username, email, password })).data; }

  // ─── Monsters ─────────────────────────────────────────────────────────────
  async getMonsterTemplates(params = {})        { return (await this.http.get('/monsters/templates', { params })).data; }
  async getMonsterTemplate(id)                  { return (await this.http.get(`/monsters/templates/${id}`)).data; }
  async getMyMonsters(params = {})              { return (await this.http.get('/monsters/my', { params })).data; }
  async getMyMonster(id)                        { return (await this.http.get(`/monsters/my/${id}`)).data; }
  async setNickname(monsterId, nickname)        { return (await this.http.post(`/monsters/my/${monsterId}/nickname`, { nickname })).data; }
  async getTeam()                               { return (await this.http.get('/monsters/team')).data; }
  async updateTeam(teamIds)                     { return (await this.http.post('/monsters/team', { team: teamIds })).data; }
  async evolveMonster(monsterId, itemId)        { return (await this.http.post(`/monsters/my/${monsterId}/evolve`, { itemId })).data; }
  async releaseMonster(monsterId)               { return (await this.http.post(`/monsters/my/${monsterId}/release`)).data; }
  async getMonsterMoves(monsterId)              { return (await this.http.get(`/monsters/my/${monsterId}/moves`)).data; }
  async updateMonsterMoves(monsterId, moves)    { return (await this.http.post(`/monsters/my/${monsterId}/moves`, { moves })).data; }
  async getTypes()                              { return (await this.http.get('/monsters/types')).data; }

  // ─── Battles ──────────────────────────────────────────────────────────────
  async startPvEBattle(npcId, region)           { return (await this.http.post('/battles/pve', { npcId, region })).data; }
  async startWildBattle(region, monsterId)      { return (await this.http.post('/battles/wild', { region, monsterId })).data; }
  async submitBattleAction(battleId, action)    { return (await this.http.post(`/battles/${battleId}/action`, action)).data; }
  async getBattleState(battleId)                { return (await this.http.get(`/battles/${battleId}/state`)).data; }
  async forfeitBattle(battleId)                 { return (await this.http.post(`/battles/${battleId}/forfeit`)).data; }
  async getBattleHistory(params = {})           { return (await this.http.get('/battles/history', { params })).data; }
  async getBattle(battleId)                     { return (await this.http.get(`/battles/${battleId}`)).data; }

  // ─── Inventory ────────────────────────────────────────────────────────────
  async getInventory()                          { return (await this.http.get('/inventory')).data; }
  async useItem(itemId, targetMonsterId)        { return (await this.http.post('/inventory/use', { itemId, targetMonsterId })).data; }

  // ─── Shop ─────────────────────────────────────────────────────────────────
  async getShopItems(category)                  { return (await this.http.get('/shop/items', { params: { category } })).data; }
  async buyItem(itemId, quantity = 1)           { return (await this.http.post('/shop/buy', { itemId, quantity })).data; }

  // ─── Users ────────────────────────────────────────────────────────────────
  async getProfile(username)                    { return (await this.http.get(`/users/profile/${username}`)).data; }
  async updateProfile(data)                     { return (await this.http.patch('/users/profile', data)).data; }
  async updateSettings(settings)               { return (await this.http.patch('/users/settings', settings)).data; }
  async claimDailyReward()                      { return (await this.http.get('/users/daily-reward')).data; }
  async sendFriendRequest(userId)               { return (await this.http.post(`/users/friend/${userId}`)).data; }
  async acceptFriend(userId)                    { return (await this.http.post(`/users/friend/${userId}/accept`)).data; }

  // ─── World ────────────────────────────────────────────────────────────────
  async getRegions()                            { return (await this.http.get('/world/regions')).data; }
  async getRegion(regionId)                     { return (await this.http.get(`/world/regions/${regionId}`)).data; }
  async unlockRegion(regionId)                  { return (await this.http.post(`/world/regions/${regionId}/unlock`)).data; }

  // ─── Tournaments ──────────────────────────────────────────────────────────
  async getTournaments(params = {})             { return (await this.http.get('/tournaments', { params })).data; }
  async getTournament(id)                       { return (await this.http.get(`/tournaments/${id}`)).data; }
  async registerTournament(id)                  { return (await this.http.post(`/tournaments/${id}/register`)).data; }
  async checkinTournament(id)                   { return (await this.http.post(`/tournaments/${id}/checkin`)).data; }

  // ─── Guilds ───────────────────────────────────────────────────────────────
  async getGuilds(params = {})                  { return (await this.http.get('/guilds', { params })).data; }
  async getGuild(id)                            { return (await this.http.get(`/guilds/${id}`)).data; }
  async createGuild(data)                       { return (await this.http.post('/guilds', data)).data; }
  async joinGuild(id)                           { return (await this.http.post(`/guilds/${id}/join`)).data; }
  async leaveGuild(id)                          { return (await this.http.post(`/guilds/${id}/leave`)).data; }

  // ─── Marketplace ──────────────────────────────────────────────────────────
  async getListings(params = {})                { return (await this.http.get('/marketplace', { params })).data; }
  async createListing(data)                     { return (await this.http.post('/marketplace/list', data)).data; }
  async buyListing(listingId)                   { return (await this.http.post(`/marketplace/${listingId}/buy`)).data; }
  async cancelListing(listingId)                { return (await this.http.delete(`/marketplace/${listingId}`)).data; }

  // ─── Quests ───────────────────────────────────────────────────────────────
  async getQuests(type)                         { return (await this.http.get('/quests', { params: { type } })).data; }
  async claimQuestReward(questId)               { return (await this.http.post(`/quests/${questId}/claim`)).data; }

  // ─── Battle Pass ──────────────────────────────────────────────────────────
  async getBattlePass()                         { return (await this.http.get('/battle-pass/current')).data; }
  async purchaseBattlePass(tier = 'premium')    { return (await this.http.post('/battle-pass/purchase', { tier })).data; }
  async claimBattlePassReward(level)            { return (await this.http.post(`/battle-pass/claim/${level}`)).data; }

  // ─── Leaderboards ─────────────────────────────────────────────────────────
  async getLeaderboard(category, params = {})   { return (await this.http.get(`/leaderboards/${category}`, { params })).data; }
  async getMyRank(category)                     { return (await this.http.get(`/leaderboards/${category}/me`)).data; }

  // ─── Achievements ─────────────────────────────────────────────────────────
  async getAchievements()                       { return (await this.http.get('/achievements')).data; }
}
