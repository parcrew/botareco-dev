/**
 * コミュニティ（プロフィール表示）ページ
 * ES5互換 - Shopify minification対応
 */
(function() {
  'use strict';

  // Supabase初期化
  var supabaseUrl = window.COMMUNITY_CONFIG.supabaseUrl;
  var supabaseKey = window.COMMUNITY_CONFIG.supabaseKey;
  var currentUser = window.COMMUNITY_CONFIG.currentUser || null;
  
  var supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

  // グローバル変数
var targetUserEmail = null;
var userProfile = null;
var profileTypes = [];
var userPosts = [];
var followStats = null;

function init() {
  console.log('🚀 コミュニティページ初期化');
  
  // ★★★ URLパラメータから user を取得 ★★★
  var urlParams = new URLSearchParams(window.location.search);
  targetUserEmail = urlParams.get('user');
  
  console.log('👤 表示対象ユーザー:', targetUserEmail);
  console.log('🔐 現在のログインユーザー:', currentUser);
  
  if (!targetUserEmail) {
    showError('ユーザーが指定されていません');
    return;
  }
  // ★★★ ここまで追加 ★★★

loadProfileTypes()
  .then(function() {
    return loadUserProfile();
  })
  .then(function() {
    return loadFollowStats();
  })
  .then(function() {
    return loadUserPosts();
  })
  .then(function() {
    renderProfile();
  })
    .catch(function(error) {
      console.error('❌ 初期化エラー:', error);
      showError('プロフィールの読み込みに失敗しました: ' + error.message);
    });
}

  /**
   * 活動タイプマスター取得
   */
  function loadProfileTypes() {
    console.log('📋 活動タイプマスター取得中...');
    
    return supabase
      .from('profile_type_master')
      .select('*')
      .order('sort_order')
      .then(function(response) {
        if (response.error) throw response.error;
        profileTypes = response.data || [];
        console.log('✅ 活動タイプマスター取得完了:', profileTypes.length + '件');
      });
  }

  /**
   * ユーザープロフィール取得
   */
/**
 * ユーザープロフィール取得
 */
function loadUserProfile() {
  console.log('🔍 プロフィール取得中:', targetUserEmail);
  
  return supabase
    .from('user_profiles')
    .select('*')
    // ★★★ username OR email で検索 ★★★
    .or('username.eq.' + targetUserEmail + ',user_email.eq.' + targetUserEmail)
    .single()
    .then(function(response) {
      if (response.error) throw response.error;
      
      userProfile = response.data;
      console.log('✅ プロフィール取得完了:', userProfile);
      
      // プロフィールが非公開の場合
      if (!userProfile.is_profile_public && currentUser !== userProfile.user_email) {
        throw new Error('このプロフィールは非公開です');
      }
    });
}
/**
 * ユーザーの公開投稿取得
 */
function loadUserPosts() {
  console.log('📝 投稿取得中...');
  
  return fetch(supabaseUrl.replace('/rest/v1', '') + '/functions/v1/process-consultation?action=get_user_posts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + supabaseKey
    },
    body: JSON.stringify({
      user_email: userProfile.user_email
    })
  })
  .then(function(response) {
    return response.json();
  })
  .then(function(data) {
    if (!data.success) throw new Error(data.error || '投稿取得失敗');
    
    var allPosts = data.all_posts || [];
    var publicPosts = data.public_posts || [];
    
    console.log('📦 全投稿数（非公開含む）:', allPosts.length + '件');
    
    // 植物別代表画像マップを作成（★実写画像のみ★）
    var plantImages = {};
    
    allPosts.forEach(function(post) {
      var plantName = post.plant_name;
      
      if (!plantImages[plantName]) {
        // ★ input_image_url（実写画像）のみを登録
        if (post.input_image_url) {
          plantImages[plantName] = post.input_image_url;
          console.log('🖼️ ' + plantName + 'の代表画像を登録:', post.input_image_url.substring(0, 60) + '...');
        }
      }
    });
    
    console.log('🌱 植物別代表画像マップ:', plantImages);
    
    // 公開投稿に代表画像を適用
    publicPosts.forEach(function(post) {
      // ★ input_image_urlがない場合に代表画像を適用（AIイラストの有無は問わない）
      if (!post.input_image_url) {
        post.plant_image_url = plantImages[post.plant_name] || null;
        if (post.plant_image_url) {
          console.log('✅ ' + post.plant_name + 'に代表画像を適用');
        }
      }
    });
    
    userPosts = publicPosts;
    console.log('✅ 公開投稿取得完了:', userPosts.length + '件');
  });
}
/**
 * フォロー統計取得
 */
function loadFollowStats() {
  console.log('📊 フォロー統計取得中...');
  
  return fetch(supabaseUrl.replace('/rest/v1', '') + '/functions/v1/process-consultation?action=get_follow_stats', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + supabaseKey
    },
    body: JSON.stringify({
      user_email: userProfile.user_email,
      viewer_email: currentUser
    })
  })
  .then(function(response) {
    return response.json();
  })
  .then(function(data) {
    if (data.success) {
      followStats = data;
      console.log('✅ フォロー統計取得完了:', followStats);
    }
  })
  .catch(function(error) {
    console.error('フォロー統計取得エラー:', error);
  });
}
  /**
   * プロフィールレンダリング
   */
function renderProfile() {
  var container = document.getElementById('community-root');
  
  var html = '';
  
// ★★★ 戻るボタン ★★★
  html += '<div style="margin-bottom: 20px; display: flex; gap: 12px; flex-wrap: wrap;">';
  html += '<a href="/pages/botareco#sns" class="btn-back-sns">← SNS一覧に戻る</a>';
  
  // 自分のプロフィールの場合のみマイページボタンを表示
  if (currentUser === userProfile.user_email) {
    html += '<a href="/pages/my-page" class="btn-back-sns">🏠 マイページ</a>';
  }
  
  html += '</div>';
  
  // プロフィールヘッダー
  html += '<div class="profile-header">';
    
    // アバター
    html += '<div class="profile-avatar">';
    if (userProfile.profile_image_url) {
      html += '<img src="' + userProfile.profile_image_url + '" alt="' + escapeHtml(userProfile.nickname) + '" />';
    } else {
      html += '<img src="https://via.placeholder.com/120?text=' + encodeURIComponent(userProfile.nickname.substring(0, 2)) + '" alt="' + escapeHtml(userProfile.nickname) + '" />';
    }
    html += '</div>';
    
    // プロフィール情報
    html += '<div class="profile-info">';
    
// 名前
html += '<h1 class="profile-name">' + escapeHtml(userProfile.nickname) + '</h1>';

// ★★★ フォロー統計とボタン ★★★
// ★★★ フォロー統計とボタン ★★★
if (followStats) {
  html += '<div class="profile-follow-section" style="margin: 16px 0; display: flex; align-items: center; gap: 20px;">';
  
  // フォロワー数・フォロー中数（クリック可能）
  html += '<div class="follow-stats" style="display: flex; gap: 20px; font-size: 14px;">';
  
  // フォロワー（誰でもクリック可能）
  html += '<div style="cursor: pointer;" onclick="openFollowersModal()">';
  html += '<strong>' + followStats.follower_count + '</strong> フォロワー';
  html += '</div>';
  
  // フォロー中（本人のみクリック可能）
  if (currentUser === userProfile.user_email) {
    html += '<div style="cursor: pointer;" onclick="openFollowingModal()">';
    html += '<strong>' + followStats.following_count + '</strong> フォロー中';
    html += '</div>';
  } else {
    html += '<div><strong>' + followStats.following_count + '</strong> フォロー中</div>';
  }
  
  html += '</div>';
  
  // フォローボタン（他人のプロフィールの場合のみ）
  if (currentUser && currentUser !== userProfile.user_email) {
    if (followStats.is_following) {
      html += '<button onclick="toggleFollow()" id="followBtn" style="padding: 8px 20px; background: #6b7280; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px;">フォロー中</button>';
    } else {
      html += '<button onclick="toggleFollow()" id="followBtn" class="btn-neo-style">フォローする</button>';
    }
  }
  
  html += '</div>';
}
// ★★★ ここまで追加 ★★★
    
    // 活動タイプバッジ
    if (userProfile.tags && userProfile.tags.length > 0) {
      html += '<div class="profile-types">';
      userProfile.tags.forEach(function(typeCode) {
        var typeInfo = getTypeInfo(typeCode);
        if (typeInfo) {
          html += '<span class="type-badge">' + typeInfo.icon_emoji + ' ' + typeInfo.display_name + '</span>';
        }
      });
      html += '</div>';
    }
    
    // 自己紹介
    if (userProfile.bio) {
      html += '<div class="profile-bio">' + escapeHtml(userProfile.bio).replace(/\n/g, '<br>') + '</div>';
    }
    
    // 店舗情報
    if (userProfile.has_shop) {
      html += '<div class="shop-info">';
      
      if (userProfile.shop_name) {
        html += '<h4>📍 ' + escapeHtml(userProfile.shop_name) + '</h4>';
      }
      
      if (userProfile.shop_address) {
        html += '<p>📍 ' + escapeHtml(userProfile.shop_address) + '</p>';
      }
      
      if (userProfile.shop_description) {
        html += '<p>' + escapeHtml(userProfile.shop_description) + '</p>';
      }
      
      // 求人・仕事依頼情報
      if (userProfile.job_openings) {
        html += '<p><strong>📢 求人情報:</strong><br>' + escapeHtml(userProfile.job_openings).replace(/\n/g, '<br>') + '</p>';
      }
      
      if (userProfile.work_request_info) {
        html += '<p><strong>💼 仕事依頼:</strong><br>' + escapeHtml(userProfile.work_request_info).replace(/\n/g, '<br>') + '</p>';
      }
      
      // SNSリンク
      var hasLinks = false;
      var linksHtml = '<div class="social-links">';
      
      if (userProfile.instagram_url) {
        linksHtml += '<a href="' + escapeHtml(userProfile.instagram_url) + '" target="_blank" class="social-link">Instagram</a>';
        hasLinks = true;
      }
      
      if (userProfile.twitter_url) {
        linksHtml += '<a href="' + escapeHtml(userProfile.twitter_url) + '" target="_blank" class="social-link">X (Twitter)</a>';
        hasLinks = true;
      }
      
      if (userProfile.facebook_url) {
        linksHtml += '<a href="' + escapeHtml(userProfile.facebook_url) + '" target="_blank" class="social-link">Facebook</a>';
        hasLinks = true;
      }
      
      if (userProfile.website_url) {
        linksHtml += '<a href="' + escapeHtml(userProfile.website_url) + '" target="_blank" class="social-link">公式サイト</a>';
        hasLinks = true;
      }
      
      if (userProfile.yahoo_auction_url) {
        linksHtml += '<a href="' + escapeHtml(userProfile.yahoo_auction_url) + '" target="_blank" class="social-link">ヤフオク</a>';
        hasLinks = true;
      }
      
      if (userProfile.mercari_url) {
        linksHtml += '<a href="' + escapeHtml(userProfile.mercari_url) + '" target="_blank" class="social-link">メルカリ</a>';
        hasLinks = true;
      }
      
      linksHtml += '</div>';
      
      if (hasLinks) {
        html += linksHtml;
      }
      
      html += '</div>'; // shop-info
    }
    
// 編集ボタン（自分のプロフィールの場合）
if (currentUser === userProfile.user_email) {  // ★ targetUserEmail → userProfile.user_email
  html += '<div style="margin-top: 16px;">';
  html += '<a href="/pages/profile-edit" class="social-link">プロフィールを編集</a>';
  html += '</div>';
}
    
    html += '</div>'; // profile-info
    html += '</div>'; // profile-header


    // ★★★ 出店イベントセクション ★★★
    if (userProfile.participating_events && userProfile.participating_events.length > 0) {
      html += '<div class="profile-card" style="margin: 24px 0; padding: 24px; background: white; border: 2px solid #111; border-radius: 16px;">';
      html += '<h3 style="margin: 0 0 16px 0; font-size: 18px; font-weight: 800;">📅 出店予定イベント</h3>';
      
      userProfile.participating_events.forEach(function(event) {
        var eventUrl = '/blogs/media/' + event.slug;
        var eventDate = formatEventDate(event.event_date);
        
        html += '<a href="' + eventUrl + '" style="display: block; padding: 16px; background: #f9fafb; border: 2px solid #e5e7eb; border-radius: 12px; margin-bottom: 12px; text-decoration: none; color: inherit; transition: all 0.2s;">';
        html += '<div style="font-size: 14px; color: #6b7280; margin-bottom: 4px;">📅 ' + eventDate + '</div>';
        html += '<div style="font-weight: 700; font-size: 16px; color: #111;">' + escapeHtml(event.title) + '</div>';
        html += '</a>';
      });
      
      html += '</div>';
    }
    
    
    // 投稿セクション
    html += '<div class="posts-section">';
    html += '<h3>公開投稿 (' + userPosts.length + '件)</h3>';
    
    if (userPosts.length === 0) {
      html += '<p style="text-align: center; color: #999; padding: 40px 0;">まだ公開投稿がありません</p>';
    } else {
      html += '<div class="posts-grid">';
      
      userPosts.forEach(function(post) {
        html += renderPostCard(post);
      });
      
      html += '</div>';
    }
    
    html += '</div>'; // posts-section
    
    container.innerHTML = html;
  }
/**
 * フォロー/アンフォロー切り替え
 */
function toggleFollow() {
  var btn = document.getElementById('followBtn');
  if (!btn) return;
  
  btn.disabled = true;
  btn.textContent = '処理中...';
  
  fetch(supabaseUrl.replace('/rest/v1', '') + '/functions/v1/process-consultation?action=toggle_follow', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + supabaseKey
    },
    body: JSON.stringify({
      follower_email: currentUser,
      following_email: userProfile.user_email
    })
  })
  .then(function(response) {
    return response.json();
  })
  .then(function(data) {
    if (data.success) {
      // 統計を再取得して再描画
      loadFollowStats().then(function() {
        renderProfile();
      });
    } else {
      alert('エラー: ' + data.error);
      btn.disabled = false;
    }
  })
  .catch(function(error) {
    console.error('フォロー切り替えエラー:', error);
    alert('フォロー処理に失敗しました');
    btn.disabled = false;
  });
}

// ★★★ グローバルに公開 ★★★
window.toggleFollow = toggleFollow;
 
/**
 * 投稿カードレンダリング
 */
function renderPostCard(post) {
  // ★★★ デバッグ用：データ確認 ★★★
  console.log('📊 Post data:', {
    input_image_url: post.input_image_url,
    ai_generated_image_url: post.ai_generated_image_url,
    plant_image_url: post.plant_image_url,
    plant_name: post.plant_name
  });
  
  var html = '<div class="post-card">';
  
  // 画像（SNSと同じロジック）
  var imageUrl = post.input_image_url || post.plant_image_url || post.ai_generated_image_url;

  if (imageUrl) {
    html += '<img src="' + escapeHtml(imageUrl) + '" class="post-image" alt="投稿画像" />';
  } else {
    // プレースホルダー表示（画像がない場合）
    html += '<div class="post-image no-image-placeholder">';
    html += '<span style="font-size: 48px;">🌱</span>';
    html += '<span style="font-weight: 700; margin-top: 8px;">' + escapeHtml(post.plant_name || '植物') + '</span>';
    html += '</div>';
  }
  
  // 植物名
  if (post.plant_name) {
    html += '<h4 style="margin: 0 0 8px 0; font-size: 16px;">' + escapeHtml(post.plant_name) + '</h4>';
  }
  
  // 相談内容（最初の100文字）
  if (post.consultation_request) {
    var shortText = post.consultation_request.substring(0, 100);
    if (post.consultation_request.length > 100) shortText += '...';
    html += '<p style="font-size: 14px; color: #666; margin: 0 0 8px 0;">' + escapeHtml(shortText) + '</p>';
  }
  
  // 日付
  var date = new Date(post.created_at);
  var dateStr = date.getFullYear() + '/' + (date.getMonth() + 1) + '/' + date.getDate();
  html += '<p style="font-size: 12px; color: #999; margin: 0;">' + dateStr + '</p>';
  
  html += '</div>';
  
  return html;
}
  /**
   * 活動タイプ情報取得
   */
  function getTypeInfo(typeCode) {
    for (var i = 0; i < profileTypes.length; i++) {
      if (profileTypes[i].type_code === typeCode) {
        return profileTypes[i];
      }
    }
    return null;
  }

  /**
   * エラーメッセージ表示
   */
  function showError(message) {
    var container = document.getElementById('community-root');
    container.innerHTML = '<div class="error-message">' + escapeHtml(message) + '</div>';
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

  /**
   * イベント日付フォーマット
   */
  function formatEventDate(dateStr) {
    var date = new Date(dateStr);
    var year = date.getFullYear();
    var month = date.getDate() + 1;
    var day = date.getDate();
    var weekdays = ['日', '月', '火', '水', '木', '金', '土'];
    var weekday = weekdays[date.getDay()];
    return year + '年' + month + '月' + day + '日（' + weekday + '）';
  }

/**
 * フォロワー一覧モーダルを開く
 */
function openFollowersModal() {
  fetch(supabaseUrl.replace('/rest/v1', '') + '/functions/v1/process-consultation?action=get_followers', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + supabaseKey
    },
    body: JSON.stringify({
      user_email: userProfile.user_email
    })
  })
  .then(function(response) {
    return response.json();
  })
  .then(function(data) {
    if (data.success) {
      showFollowModal('フォロワー', data.followers);
    }
  })
  .catch(function(error) {
    console.error('フォロワー取得エラー:', error);
    showError('フォロワー一覧の取得に失敗しました');
  });
}

function openFollowingModal() {
  fetch(supabaseUrl.replace('/rest/v1', '') + '/functions/v1/process-consultation?action=get_following', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + supabaseKey
    },
    body: JSON.stringify({
      user_email: userProfile.user_email
    })
  })
  .then(function(response) {
    return response.json();
  })
  .then(function(data) {
    if (data.success) {
      showFollowModal('フォロー中', data.following);
    }
  })
  .catch(function(error) {
    console.error('フォロー中取得エラー:', error);
    showError('フォロー中一覧の取得に失敗しました');
  });
}
/**
 * フォローモーダル表示
 */
function showFollowModal(title, users) {
  var modalHtml = '<div class="follow-modal-overlay" onclick="closeFollowModal()">';
  modalHtml += '<div class="follow-modal" onclick="event.stopPropagation()">';
  modalHtml += '<div class="follow-modal-header">';
  modalHtml += '<h3>' + title + ' (' + users.length + ')</h3>';
  modalHtml += '<button onclick="closeFollowModal()" class="close-btn">✕</button>';
  modalHtml += '</div>';
  modalHtml += '<div class="follow-modal-body">';
  
  if (users.length === 0) {
    modalHtml += '<p style="text-align: center; color: #999; padding: 40px 0;">まだ' + title + 'がいません</p>';
  } else {
    users.forEach(function(user) {
      var profileUrl = '/pages/community?user=' + encodeURIComponent(user.username || user.user_email);
      modalHtml += '<a href="' + profileUrl + '" class="follow-user-item">';
      
      if (user.profile_image_url) {
        modalHtml += '<img src="' + escapeHtml(user.profile_image_url) + '" class="follow-user-avatar" />';
      } else {
        modalHtml += '<div class="follow-user-avatar-placeholder">👤</div>';
      }
      
      modalHtml += '<div class="follow-user-info">';
      modalHtml += '<div class="follow-user-nickname">' + escapeHtml(user.nickname || user.username || 'ユーザー') + '</div>';
      if (user.username) {
        modalHtml += '<div class="follow-user-username">@' + escapeHtml(user.username) + '</div>';
      }
      modalHtml += '</div>';
      modalHtml += '</a>';
    });
  }
  
  modalHtml += '</div>';
  modalHtml += '</div>';
  modalHtml += '</div>';
  
  var modalContainer = document.createElement('div');
  modalContainer.id = 'follow-modal-container';
  modalContainer.innerHTML = modalHtml;
  document.body.appendChild(modalContainer);
}

/**
 * フォローモーダルを閉じる
 */
function closeFollowModal() {
  var container = document.getElementById('follow-modal-container');
  if (container) {
    container.remove();
  }
}

// グローバルに公開
window.openFollowersModal = openFollowersModal;
window.openFollowingModal = openFollowingModal;
window.closeFollowModal = closeFollowModal;
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
 * 地域別イベント取得
 */
function loadRegionalEvents(regionCode) {
  console.log('🗾 地域イベント取得開始:', regionCode);
  
  if (!regionCode) {
    console.log('⚠️ 地域コードなし');
    return Promise.resolve([]);
  }
  
  var ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxhaXhnY2p2b3dkc3pydGRweGxxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDU2NTM5MTIsImV4cCI6MjA2MTIyOTkxMn0.yAvMili-p_uQMHYlz-fpErgFqX243J5z1zI87VqO63M';
  var FUNC_BASE = 'https://laixgcjvowdszrtdpxlq.supabase.co/functions/v1';
  
  // 今月と来月のイベントを取得
  var today = new Date();
  var thisMonth = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0');
  
  var url = FUNC_BASE + '/get-events?month=' + thisMonth;
  
  return fetch(url, {
    headers: { 'Authorization': 'Bearer ' + ANON_KEY }
  })
  .then(function(response) {
    return response.json();
  })
  .then(function(data) {
    var events = data.events || data.data || [];
    console.log('📅 イベント取得:', events.length + '件');
    
    // 今日以降のイベントのみ
    var todayStr = today.toISOString().slice(0, 10);
    var futureEvents = events.filter(function(event) {
      return event.event_date >= todayStr;
    });
    
    // 地域でフィルタ
    var regionalEvents = futureEvents.filter(function(event) {
      return event.regions && event.regions.includes(regionCode);
    });
    
    console.log('✅ 地域イベント:', regionalEvents.length + '件');
    
    // 最大3件に制限
    return regionalEvents.slice(0, 3);
  })
  .catch(function(error) {
    console.error('❌ 地域イベント取得エラー:', error);
    return [];
  });
}
  // 初期化実行
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();