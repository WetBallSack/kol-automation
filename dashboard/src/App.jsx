import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'

// ─── CONFIG — fill these in before deploying ─────────────────────────────────
const SUPABASE_URL = 'YOUR_SUPABASE_URL'
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY'
const SUPABASE_SERVICE_ROLE_KEY = 'YOUR_SUPABASE_SERVICE_ROLE_KEY'
// ─────────────────────────────────────────────────────────────────────────────

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

const STATUS_COLORS = {
  ready: 'bg-blue-100 text-blue-800',
  published: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
  banned: 'bg-orange-100 text-orange-800',
  queued: 'bg-gray-100 text-gray-700',
}

const STATUS_LABELS = {
  ready: '待发布',
  published: '已发布',
  failed: '失败',
  banned: '违禁',
  queued: '排队中',
}

const ACCOUNT_STATUS_COLORS = {
  active: 'bg-green-100 text-green-800',
  needs_login: 'bg-yellow-100 text-yellow-800',
  banned: 'bg-red-100 text-red-800',
}

function Badge({ label, colorClass }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${colorClass}`}>  
      {label}  
    </span>
  )
}

function StatCard({ label, value, color = 'text-gray-900' }) {
  return (
    <div className="bg-white rounded-xl p-4 shadow-sm text-center min-w-[90px]">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-gray-500 mt-1">{label}</div>
    </div>
  )
}

function PostModal({ post, onClose }) {
  if (!post) return null
  const subs = post.substitutions_log || []

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div
        className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl max-h-[92vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b px-5 py-4 flex items-center justify-between">
          <h2 className="font-bold text-lg text-gray-900 flex-1 mr-4 line-clamp-2">{post.title}</h2>
          <button
            onClick={onClose}
            className="shrink-0 w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 text-xl font-bold active:bg-gray-200"
          >×</button>
        </div>

        <div className="px-5 pb-8 space-y-5">
          <div>
            <div className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-1">封面文字</div>
            <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-800">{post.cover_text}</div>
          </div>

          <div>
            <div className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-1">正文</div>
            <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-800 whitespace-pre-wrap">{post.body}</div>
          </div>

          <div>
            <div className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-2">话题标签</div>
            <div className="flex flex-wrap gap-2">
              {(post.hashtags || []).map((tag, i) => (
                <span key={i} className="bg-pink-50 text-pink-700 text-xs px-2 py-1 rounded-full">{tag}</span>
              ))}
            </div>
          </div>

          <div>
            <div className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-2">幻灯片 ({(post.slides || []).length} 张)</div>
            <div className="space-y-3">
              {(post.slides || []).map((slide, i) => (
                <div key={i} className="border border-gray-100 rounded-xl p-3">
                  <div className="text-xs text-gray-400 mb-1">第 {i + 1} 张</div>
                  <div className="font-semibold text-gray-900 text-sm mb-1">{slide.heading}</div>
                  <div className="text-gray-600 text-sm">{slide.body}</div>
                </div>
              ))}
            </div>
          </div>

          {subs.length > 0 && (
            <div>
              <div className="text-xs text-orange-600 font-semibold uppercase tracking-wide mb-2">⚠️ 敏感词替换记录 ({subs.length} 条)</div>
              <div className="bg-orange-50 rounded-xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-orange-100 text-orange-800">
                      <th className="text-left px-3 py-2">字段</th>
                      <th className="text-left px-3 py-2">原词</th>
                      <th className="text-left px-3 py-2">替换词</th>
                      <th className="text-right px-3 py-2">次数</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subs.map((s, i) => (
                      <tr key={i} className="border-t border-orange-100">
                        <td className="px-3 py-2 text-gray-500">{s.field}</td>
                        <td className="px-3 py-2 text-red-600 font-medium">{s.original}</td>
                        <td className="px-3 py-2 text-green-700 font-medium">{s.replacement}</td>
                        <td className="px-3 py-2 text-right text-gray-600">{s.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {post.xhs_post_url && (
            <div>
              <div className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-1">已发布链接</div>
              <a
                href={post.xhs_post_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-pink-600 text-sm break-all underline"
              >{post.xhs_post_url}</a>
            </div>
          )}

          {post.error_message && (
            <div>
              <div className="text-xs text-red-500 font-semibold uppercase tracking-wide mb-1">错误信息</div>
              <div className="bg-red-50 rounded-lg p-3 text-xs text-red-700 break-all">{post.error_message}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const [activeTab, setActiveTab] = useState('posts')
  const [statusFilter, setStatusFilter] = useState('all')
  const [posts, setPosts] = useState([])
  const [accounts, setAccounts] = useState([])
  const [logs, setLogs] = useState([])
  const [analytics, setAnalytics] = useState([])
  const [loading, setLoading] = useState(true)
  const [lastRefreshed, setLastRefreshed] = useState(null)
  const [selectedPost, setSelectedPost] = useState(null)
  const [generating, setGenerating] = useState(false)

  const fetchData = useCallback(async () => {
    const [postsRes, accountsRes, logsRes, analyticsRes] = await Promise.all([
      supabase.from('posts').select('*').order('created_at', { ascending: false }).limit(100),
      supabase.from('xhs_accounts').select('*').order('created_at'),
      supabase.from('cron_logs').select('*').order('run_at', { ascending: false }).limit(10),
      supabase.from('analytics').select('*'),
    ])
    if (postsRes.data) setPosts(postsRes.data)
    if (accountsRes.data) setAccounts(accountsRes.data)
    if (logsRes.data) setLogs(logsRes.data)
    if (analyticsRes.data) setAnalytics(analyticsRes.data)
    setLastRefreshed(new Date())
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 15000)
    return () => clearInterval(interval)
  }, [fetchData])

  const handleRunGenerator = async () => {
    setGenerating(true)
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/cron-generator`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
        },
      })
      const data = await res.json()
      alert(res.ok ? `✅ 生成成功！${data.notes || ''}` : `❌ 生成失败: ${data.notes || '未知错误'}`)
      await fetchData()
    } catch (e) {
      alert(`❌ 请求失败: ${e.message}`)
    }
    setGenerating(false)
  }

  // Stats
  const totalPosts = posts.length
  const published = posts.filter(p => p.status === 'published').length
  const ready = posts.filter(p => p.status === 'ready').length
  const failedBanned = posts.filter(p => p.status === 'failed' || p.status === 'banned').length
  const totalClicks = analytics.reduce((s, a) => s + (a.clicks || 0), 0)
  const totalCommission = analytics.reduce((s, a) => s + (parseFloat(a.commission_usd) || 0), 0).toFixed(2)

  const filteredPosts = statusFilter === 'all' ? posts : posts.filter(p => p.status === statusFilter)

  const STATUS_FILTERS = [
    { key: 'all', label: '全部' },
    { key: 'ready', label: '待发布' },
    { key: 'published', label: '已发布' },
    { key: 'failed', label: '失败' },
    { key: 'banned', label: '违禁' },
  ]

  const TABS = [
    { key: 'posts', label: '帖子' },
    { key: 'accounts', label: '账号' },
    { key: 'logs', label: '日志' },
  ]

  return (
    <div className="min-h-screen bg-gray-50 pb-10">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-40 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <h1 className="text-lg font-bold text-gray-900">📊 小红书自动化</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRunGenerator}
              disabled={generating}
              className="bg-pink-600 active:bg-pink-700 text-white text-sm font-semibold px-4 py-2 rounded-xl min-h-[44px] disabled:opacity-60"
            >
              {generating ? '生成中…' : '🚀 立即生成'}
            </button>
            <button
              onClick={fetchData}
              className="bg-gray-100 active:bg-gray-200 text-gray-700 text-sm px-3 py-2 rounded-xl min-h-[44px]"
            >↻</button>
          </div>
        </div>
        {lastRefreshed && (
          <div className="text-center text-xs text-gray-400 pb-2">
            上次刷新: {lastRefreshed.toLocaleTimeString('zh-CN')}
          </div>
        )}
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-5 space-y-5">
        {/* Stats Row */}
        <div className="overflow-x-auto -mx-4 px-4">
          <div className="flex gap-3 w-max">
            <StatCard label="总帖子" value={totalPosts} />
            <StatCard label="已发布" value={published} color="text-green-600" />
            <StatCard label="待发布" value={ready} color="text-blue-600" />
            <StatCard label="失败/违禁" value={failedBanned} color="text-red-500" />
            <StatCard label="总点击" value={totalClicks} />
            <StatCard label="佣金 $" value={totalCommission} color="text-amber-600" />
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-2xl">
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-colors min-h-[44px] ${
                activeTab === tab.key
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 active:bg-white/60'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Posts Tab */}
        {activeTab === 'posts' && (
          <div className="space-y-4">
            {/* Status filter pills */}
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
              {STATUS_FILTERS.map(f => (
                <button
                  key={f.key}
                  onClick={() => setStatusFilter(f.key)}
                  className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium min-h-[40px] transition-colors ${
                    statusFilter === f.key
                      ? 'bg-pink-600 text-white'
                      : 'bg-white text-gray-600 border border-gray-200 active:bg-gray-50'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {loading && <div className="text-center text-gray-400 py-10">加载中…</div>}

            {!loading && filteredPosts.length === 0 && (
              <div className="text-center text-gray-400 py-10 bg-white rounded-2xl">
                暂无帖子
              </div>
            )}

            {filteredPosts.map(post => (
              <div
                key={post.id}
                onClick={() => setSelectedPost(post)}
                className="bg-white rounded-2xl p-4 shadow-sm active:bg-gray-50 cursor-pointer"
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex flex-wrap gap-1.5">
                    <Badge label="小红书" colorClass="bg-pink-100 text-pink-700" />
                    <Badge
                      label={STATUS_LABELS[post.status] || post.status}
                      colorClass={STATUS_COLORS[post.status] || 'bg-gray-100 text-gray-700'}
                    />
                    {post.substitutions_log && post.substitutions_log.length > 0 && (
                      <Badge label="⚠️ 含替换" colorClass="bg-orange-100 text-orange-700" />
                    )}
                  </div>
                  <span className="text-xs text-gray-400 shrink-0">
                    {(post.slides || []).length} 张图
                  </span>
                </div>
                <h3 className="font-semibold text-gray-900 text-sm leading-snug mb-1 line-clamp-2">
                  {post.title}
                </h3>
                <p className="text-gray-500 text-xs line-clamp-2">{post.body}</p>
              </div>
            ))}
          </div>
        )}

        {/* Accounts Tab */}
        {activeTab === 'accounts' && (
          <div className="space-y-4">  
            {loading && <div className="text-center text-gray-400 py-10">加载中…</div>}  
            {!loading && accounts.length === 0 && (  
              <div className="text-center text-gray-400 py-10 bg-white rounded-2xl">暂无账号</div>  
            )}  
            {accounts.map(acc => (  
              <div key={acc.id} className="bg-white rounded-2xl p-5 shadow-sm space-y-3">  
                <div className="flex items-center justify-between">  
                  <div className="font-bold text-gray-900">@{acc.username}</div>  
                  <Badge  
                    label={acc.status === 'active' ? '正常' : acc.status === 'needs_login' ? '待登录' : '封号'}  
                    colorClass={ACCOUNT_STATUS_COLORS[acc.status] || 'bg-gray-100 text-gray-700'}  
                  />  
                </div>  
                <div className="grid grid-cols-2 gap-3 text-sm">  
                  <div className="bg-gray-50 rounded-xl p-3">  
                    <div className="text-xs text-gray-400 mb-1">今日发帖</div>  
                    <div className="font-semibold text-gray-900">{acc.posts_today} / 1</div>  
                  </div>  
                  <div className="bg-gray-50 rounded-xl p-3">  
                    <div className="text-xs text-gray-400 mb-1">最后发帖</div>  
                    <div className="font-semibold text-gray-900 text-xs">  
                      {acc.last_post_at  
                        ? new Date(acc.last_post_at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })  
                        : '从未'}  
                    </div>  
                  </div>  
                </div>  
                {acc.is_shadowbanned && (  
                  <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 text-sm text-orange-700">  
                    ⚠️ 疑似影子封禁。建议暂停发帖并检查账号。  
                  </div>  
                )}  
                {acc.status === 'needs_login' && (  
                  <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-sm text-yellow-800">  
                    🔑 需要扫码登录。参考 README 第7步。  
                  </div>  
                )}  
                {acc.status === 'banned' && (  
                  <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">  
                    🚫 账号已被封禁。请停止所有发帖，等待7天后考虑新账号。  
                  </div>  
                )}  
              </div>  
            ))}  
          </div>  
        )}  

        {/* Logs Tab */}  
        {activeTab === 'logs' && (  
          <div className="space-y-3">  
            {loading && <div className="text-center text-gray-400 py-10">加载中…</div>}  
            {!loading && logs.length === 0 && (  
              <div className="text-center text-gray-400 py-10 bg-white rounded-2xl">暂无日志</div>  
            )}  
            {logs.map(log => (  
              <div  
                key={log.id}  
                className={`rounded-2xl p-4 shadow-sm ${
                  log.error_count > 0 ? 'bg-red-50 border border-red-100' : 'bg-green-50 border border-green-100'
                }`}  
              >  
                <div className="flex items-center justify-between mb-2">  
                  <div className="text-xs text-gray-500">  
                    {new Date(log.run_at).toLocaleString('zh-CN')}  
                  </div>  
                  <div className="flex gap-2">  
                    <Badge  
                      label={`+${log.posts_generated} 篇`}  
                      colorClass="bg-green-100 text-green-700"  
                    />  
                    {log.error_count > 0 && (  
                      <Badge label={`${log.error_count} 错误`} colorClass="bg-red-100 text-red-700" />  
                    )}  
                  </div>  
                </div>  
                {log.topic_used && (  
                  <div className="text-sm text-gray-800 font-medium mb-1 line-clamp-1">  
                    📌 {log.topic_used}  
                  </div>  
                )}  
                <div className="flex items-center gap-3 text-xs text-gray-500">  
                  <span>⏱ {log.duration_ms}ms</span>  
                  {log.notes && <span className="line-clamp-1 flex-1">{log.notes}</span>}  
                </div>  
              </div>  
            ))}  
          </div>  
        )}  
      </div>  

      {/* Post Modal */}  
      {selectedPost && <PostModal post={selectedPost} onClose={() => setSelectedPost(null)} />}
    </div>
  )
}  
