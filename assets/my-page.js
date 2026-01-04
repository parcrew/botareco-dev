(function() {
  'use strict';

  // 設定を取得
  var config = window.MY_PAGE_CONFIG || {};
  var userEmail = config.userEmail;
  var supabaseUrl = config.supabaseUrl;
  var supabaseKey = config.supabaseKey;
  var supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

  // グローバル変数
  var userProfile = null;
  var stats = null;
  var careTasks = [];
  var regionalEvents = [];

  /**
   * 初期化
   */
  function init() {
    console.log('🏠 マイページ初期化開始');
    
    if (!userEmail) {
      showError('ログインが必要です');
      return;
    }

    // データ取得
    Promise.all([
      loadUserProfile(),
      loadStats(),
      loadCareTasks()
    ])
    .then(function() {
      // プロフィールがあれば地域イベントも取得
      if (userProfile && userProfile.address_prefecture) {
        var regionCode = getRegionFromPrefecture(userProfile.address_prefecture);
        if (regionCode) {
          return loadRegionalEvents(regionCode);
        }
      }
    })
    .then(function(events) {
      if (events) {
        regionalEvents = events;
      }
      render();
    })
    .catch(function(error) {
      console.error('❌ 初期化エラー:', error);
      showError('データの読み込みに失敗しました');
    });
  }

  /**
   * プロフィール取得
   */
  function loadUserProfile() {
    return fetch(supabaseUrl.replace('/rest/v1', '') + '/functions/v1/process-consultation?action=get_user_profile', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + supabaseKey
      },
      body: JSON.stringify({ user_email: userEmail })
    })
    .then(function(response) {
      return response.json();
    })
    .then(function(data) {
      if (data.success) {
        userProfile = data.profile;
        console.log('✅ プロフィール取得成功');
      }
    });
  }

  /**
   * 統計情報取得
   */
  function loadStats() {
    return fetch(supabaseUrl.replace('/rest/v1', '') + '/functions/v1/process-consultation?action=header_stats', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + supabaseKey
      },
      body: JSON.stringify({ user_email: userEmail })
    })
    .then(function(response) {
      return response.json();
    })
    .then(function(data) {
      if (data.success) {
        stats = data.stats;
        console.log('✅ 統計情報取得成功');
      }
    });
  }

  /**
   * 今日のケアタスク取得
   */
  function loadCareTasks() {
    return fetch(supabaseUrl.replace('/rest/v1', '') + '/functions/v1/process-consultation?action=todays_care_list', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + supabaseKey
      },
      body: JSON.stringify({ user_email: userEmail })
    })
    .then(function(response) {
      return response.json();
    })
    .then(function(data) {
      if (data.success) {
        careTasks = data.care_items || [];
        console.log('✅ ケアタスク取得成功:', careTasks.length + '件');
      }
    });
  }

  /**
   * 地域イベント取得
   */
  function loadRegionalEvents(regionCode) {
    console.log('🗾 地域イベント取得開始:', regionCode);
    
    if (!regionCode) {
      return Promise.resolve([]);
    }
    
    var today = new Date();
    var thisMonth = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0');
    var url = 'https://laixgcjvowdszrtdpxlq.supabase.co/functions/v1/get-events?month=' + thisMonth;
    
    return fetch(url, {
      headers: { 'Authorization': 'Bearer ' + supabaseKey }
    })
    .then(function(response) {
      return response.json();
    })
    .then(function(data) {
      var events = data.events || data.data || [];
      console.log('📅 イベント取得:', events.length + '件');
      
      var todayStr = today.toISOString().slice(0, 10);
      var futureEvents = events.filter(function(event) {
        return event.event_date >= todayStr;
      });
      
      var regionalEvents = futureEvents.filter(function(event) {
        return event.regions && event.regions.includes(regionCode);
      });
      
      console.log('✅ 地域イベント:', regionalEvents.length + '件');
      return regionalEvents.slice(0, 5);
    })
    .catch(function(error) {
      console.error('❌ 地域イベント取得エラー:', error);
      return [];
    });
  }

  /**
   * レンダリング
   */
  function render() {
    var html = '';
    
    // ヘッダー
    html += '<div class="my-page-header">';
    html += '<h1>🏠 マイページ</h1>';
    html += '<p>あなたの育成記録とお知らせをまとめて確認できます</p>';
    html += '</div>';

    // 統計カード
    if (stats) {
      html += '<div class="my-page-grid">';
      
      // 植物数
      html += '<div class="my-page-card">';
      html += '<h2>🌱 育成中の植物</h2>';
      html += '<div class="stat-number">' + (stats.consultation_count || 0) + '</div>';
      html += '<div class="stat-label">種類</div>';
      html += '</div>';
      
      // 記録数
      html += '<div class="my-page-card">';
      html += '<h2>📝 相談記録</h2>';
      html += '<div class="stat-number">' + (stats.total_records || 0) + '</div>';
      html += '<div class="stat-label">回</div>';
      html += '</div>';
      
      // 育成日数
      html += '<div class="my-page-card">';
      html += '<h2>📅 育成期間</h2>';
      html += '<div class="stat-number">' + (stats.growth_period_days || 0) + '</div>';
      html += '<div class="stat-label">日間</div>';
      html += '</div>';
      
      html += '</div>';
    }

    // 今日のケアタスク
    html += '<div class="my-page-card" style="margin-bottom: 24px;">';
    html += '<h2>💧 今日のケアタスク</h2>';
    
    if (careTasks.length === 0) {
      html += '<div class="empty-state">';
      html += '<div class="empty-state-icon">✨</div>';
      html += '<p>今日のケアタスクはありません</p>';
      html += '</div>';
    } else {
      careTasks.forEach(function(task) {
        html += '<div class="care-item">';
        html += '<div class="care-icon">' + task.care_icon + '</div>';
        html += '<div class="care-info">';
        html += '<div class="care-plant-name">' + escapeHtml(task.plant_name) + '</div>';
        html += '<div class="care-type">' + task.care_name;
        if (task.days_overdue > 0) {
          html += ' <span style="color: #ef4444;">（' + task.days_overdue + '日遅れ）</span>';
        }
        html += '</div>';
        html += '</div>';
        html += '</div>';
      });
    }
    
    html += '</div>';

    // 地域イベント
    if (userProfile && userProfile.address_prefecture && regionalEvents.length > 0) {
      var regionCode = getRegionFromPrefecture(userProfile.address_prefecture);
      var regionNameJp = getRegionNameJp(regionCode);
      
      html += '<div class="my-page-card" style="margin-bottom: 24px;">';
      html += '<h2>🗾 あなたの地域のイベント（' + regionNameJp + '）</h2>';
      
      regionalEvents.forEach(function(event) {
        var eventUrl = '/blogs/media/' + event.slug;
        html += '<a href="' + eventUrl + '" class="event-item">';
        html += '<div class="event-date">📅 ' + formatDate(event.event_date) + '</div>';
        html += '<div class="event-title">' + escapeHtml(event.title) + '</div>';
        html += '</a>';
      });
      
      html += '</div>';
    }

    // アクションボタン
    html += '<div style="text-align: center; margin-top: 32px;">';
    html += '<a href="/pages/botareco" class="btn-neo-style" style="margin-right: 12px;">🌿 育成記録を見る</a>';
    html += '<a href="/pages/profile-edit" class="btn-neo-style">⚙️ プロフィール編集</a>';
    html += '</div>';

    document.getElementById('my-page-root').innerHTML = html;
  }

  /**
   * 都道府県から地域コードを取得
   */
  function getRegionFromPrefecture(prefecture) {
    if (!prefecture) return null;
    
    var regionMap = {
      '北海道': 'HOKKAIDO',
      '青森県': 'TOHOKU', '岩手県': 'TOHOKU', '宮城県': 'TOHOKU',
      '秋田県': 'TOHOKU', '山形県': 'TOHOKU', '福島県': 'TOHOKU',
      '茨城県': 'KANTO', '栃木県': 'KANTO', '群馬県': 'KANTO',
      '埼玉県': 'KANTO', '千葉県': 'KANTO', '東京都': 'KANTO', '神奈川県': 'KANTO',
      '新潟県': 'CHUBU', '富山県': 'CHUBU', '石川県': 'CHUBU', '福井県': 'CHUBU',
      '山梨県': 'CHUBU', '長野県': 'CHUBU', '岐阜県': 'CHUBU',
      '静岡県': 'CHUBU', '愛知県': 'CHUBU',
      '三重県': 'KANSAI', '滋賀県': 'KANSAI', '京都府': 'KANSAI',
      '大阪府': 'KANSAI', '兵庫県': 'KANSAI', '奈良県': 'KANSAI', '和歌山県': 'KANSAI',
      '鳥取県': 'CHUGOKU', '島根県': 'CHUGOKU', '岡山県': 'CHUGOKU',
      '広島県': 'CHUGOKU', '山口県': 'CHUGOKU',
      '徳島県': 'SHIKOKU', '香川県': 'SHIKOKU', '愛媛県': 'SHIKOKU', '高知県': 'SHIKOKU',
      '福岡県': 'KYUSHU', '佐賀県': 'KYUSHU', '長崎県': 'KYUSHU',
      '熊本県': 'KYUSHU', '大分県': 'KYUSHU', '宮崎県': 'KYUSHU',
      '鹿児島県': 'KYUSHU', '沖縄県': 'OKINAWA'
    };
    
    return regionMap[prefecture] || null;
  }

  /**
   * 地域名（日本語）を取得
   */
  function getRegionNameJp(regionCode) {
    var names = {
      'HOKKAIDO': '北海道',
      'TOHOKU': '東北',
      'KANTO': '関東',
      'CHUBU': '中部',
      'KANSAI': '関西',
      'CHUGOKU': '中国',
      'SHIKOKU': '四国',
      'KYUSHU': '九州',
      'OKINAWA': '沖縄'
    };
    return names[regionCode] || regionCode;
  }

  /**
   * 日付フォーマット
   */
  function formatDate(dateStr) {
    var date = new Date(dateStr);
    var month = date.getMonth() + 1;
    var day = date.getDate();
    var weekdays = ['日', '月', '火', '水', '木', '金', '土'];
    var weekday = weekdays[date.getDay()];
    return month + '月' + day + '日（' + weekday + '）';
  }

  /**
   * エラー表示
   */
  function showError(message) {
    document.getElementById('my-page-root').innerHTML = 
      '<div class="error-message" style="text-align: center; padding: 40px; color: #ef4444;">' + 
      escapeHtml(message) + 
      '</div>';
  }

  /**
   * HTMLエスケープ
   */
  function escapeHtml(text) {
    if (!text) return '';
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // 初期化実行
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();