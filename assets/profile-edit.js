/**
 * プロフィール編集アプリ（完全版）
 * ES5互換 - Shopify minification対応
 * 初回アクセス時にShopify情報から自動プロフィール作成
 */
(function() {
  'use strict';

  // Supabase初期化
  var supabaseUrl = window.PROFILE_EDIT_CONFIG.supabaseUrl;
  var supabaseKey = window.PROFILE_EDIT_CONFIG.supabaseKey;
  var userEmail = window.PROFILE_EDIT_CONFIG.userEmail;
  var customerFirstName = window.PROFILE_EDIT_CONFIG.customerFirstName || '';
  var customerLastName = window.PROFILE_EDIT_CONFIG.customerLastName || '';
  
  var supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

  // グローバル変数
  var currentProfile = null;
  var profileTypes = [];
  var selectedTypes = [];
  var hasShop = false;
  var uploadedAvatarUrl = null;
  var isFirstTime = false;
var allEvents = []; 
var selectedEvents = []; 

  /**
   * 初期化
   */
  function init() {
    console.log('🚀 プロフィール編集アプリ初期化');
    console.log('📧 ユーザーメール:', userEmail);
    console.log('👤 Shopify名前:', customerFirstName, customerLastName);
    
    if (!userEmail) {
      showError('ログインが必要です');
      return;
    }

    loadProfileTypes()
      .then(function() {
        return loadOrCreateProfile();
      })
      .then(function() {
        renderForm();
        attachEventListeners();
        
        if (isFirstTime) {
          showMessage('Shopifyの登録情報から自動でプロフィールを作成しました。必要に応じて編集してください。', 'info');
        }
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
   * プロフィール取得または自動作成
   */
  function loadOrCreateProfile() {
    console.log('🔍 プロフィール取得中...');
    return supabase
      .from('user_profiles')
      .select('*')
      .eq('user_email', userEmail)
      .single()
      .then(function(response) {
        // 既存プロフィールがある場合
        if (response.data) {
          currentProfile = response.data;
          console.log('✅ 既存プロフィール取得:', currentProfile);
          selectedTypes = currentProfile.tags || [];
          hasShop = currentProfile.has_shop || false;
          uploadedAvatarUrl = currentProfile.profile_image_url;
          return;
        }
        
        // プロフィールが存在しない場合 → 自動作成
        if (response.error && response.error.code === 'PGRST116') {
          console.log('ℹ️ プロフィールが存在しません。Shopify情報から自動作成します');
          return createInitialProfile();
        }
        
        // その他のエラー
        if (response.error) {
          throw response.error;
        }
      });
  }

  /**
   * 初回プロフィール自動作成
   */
function createInitialProfile() {
  var autoNickname = generateNickname();
  
  // ★★★ Shopifyの配送先住所を取得 ★★★
  var shopifyAddress = window.LEAFLA?.customer?.default_address || {};
  
  console.log('📍 Shopifyの配送先住所:', shopifyAddress);
  
  var initialData = {
    user_email: userEmail,
    nickname: autoNickname,
    display_name: (customerFirstName + ' ' + customerLastName).trim() || '',
    bio: '',
    tags: [],
    profile_image_url: 'https://cdn.shopify.com/s/files/1/0658/5332/5495/files/blg2.png?v=1767146489',
    has_shop: false,
    is_profile_public: true,
    allow_comments: true,
    
    // ★★★ Shopifyの住所を初期値に ★★★
    postal_code: shopifyAddress.zip || '',
    address_prefecture: shopifyAddress.province || '',
    address_city: shopifyAddress.city || '',
    address_line1: shopifyAddress.address1 || '',
    address_line2: shopifyAddress.address2 || '',
    phone: shopifyAddress.phone || ''
  };
  
  console.log('📝 初回プロフィール作成データ（Shopify住所含む）:', initialData);
  
  return supabase
    .from('user_profiles')
    .insert(initialData)
    .select()
    .single()
    .then(function(response) {
      if (response.error) throw response.error;
      
      currentProfile = response.data;
      selectedTypes = [];
      hasShop = false;
      uploadedAvatarUrl = response.data.profile_image_url;
      isFirstTime = true;
      
      console.log('✅ 初回プロフィール作成完了（Shopify住所同期済み）:', currentProfile);
    });
}

  /**
   * ニックネーム自動生成
   */
  function generateNickname() {
    // 1. 名前がある場合は名前を使う
    if (customerFirstName || customerLastName) {
      var name = (customerFirstName + customerLastName).trim();
      if (name) {
        console.log('ℹ️ ニックネーム生成: Shopify名前使用 → ' + name);
        return name;
      }
    }
    
    // 2. メールアドレスの@前を使う
    var emailPrefix = userEmail.split('@')[0];
    if (emailPrefix && emailPrefix.length > 0) {
      console.log('ℹ️ ニックネーム生成: メールアドレス使用 → ' + emailPrefix);
      return emailPrefix;
    }
    
    // 3. ランダムニックネーム生成
    var randomId = 'user_' + Math.random().toString(36).substring(2, 6);
    console.log('ℹ️ ニックネーム生成: ランダム → ' + randomId);
    return randomId;
  }

  /**
   * フォームレンダリング
   */
function renderForm() {
  var container = document.getElementById('profile-edit-root');
  var html = '<form id="profile-form">';

// ボタンコンテナ開始
  html += '<div class="btn-container">';

  // ① SNS一覧に戻るボタン
  html += '<a href="/pages/botareco#sns" class="btn-neo-style">← SNS一覧に戻る</a>';

  // ② マイページボタン（★追加）
  html += '<a href="/pages/my-page" class="btn-neo-style">🏠 マイページ</a>';

  // ③ 自分のプロフィールを見るボタン（条件付き）
  if (currentProfile && currentProfile.username) {
    var profileUrl = '/pages/community?user=' + encodeURIComponent(currentProfile.username);
    html += '<a href="' + profileUrl + '" class="btn-neo-style">📄 自分のプロフィールを見る</a>';
  }

  html += '</div>'; // ボタンコンテナ終了

    // メッセージ表示エリア
    html += '<div id="message-area"></div>';
    
    // 基本情報
    html += '<section class="profile-section">';
    html += '<h3>基本情報</h3>';
    
    // ニックネーム
    html += '<div class="form-group">';
    html += '<label>ニックネーム <span class="required">*</span></label>';
    html += '<input type="text" id="nickname" value="' + escapeHtml(currentProfile && currentProfile.nickname || '') + '" required maxlength="50" />';
    html += '<div class="help-text">SNSで表示される名前です</div>';
    html += '</div>';
    
html += '<div class="form-group">';
html += '<label>ユーザー名（URL用） <span class="required">*</span></label>';
html += '<input type="text" id="username" value="' + escapeHtml(currentProfile && currentProfile.username || '') + '" required maxlength="30" pattern="[a-z0-9_\\-]+" />';
html += '<div class="help-text">英数字・ハイフン・アンダースコアのみ（例: leaf-labo）<br>プロフィールURLに使用されます: /pages/community?user=<strong>' + escapeHtml(currentProfile && currentProfile.username || 'あなたのユーザー名') + '</strong></div>';
html += '</div>';

    // プロフィール画像
    html += '<div class="form-group">';
    html += '<label>プロフィール画像</label>';
    if (uploadedAvatarUrl) {
      html += '<div class="avatar-preview-container">';
      html += '<img src="' + uploadedAvatarUrl + '" class="avatar-preview" id="avatar-preview" />';
      html += '</div>';
    }
    html += '<input type="file" id="avatar-input" accept="image/*" />';
    html += '<div class="help-text">推奨サイズ: 400x400px以上（正方形）、最大5MB</div>';
    html += '</div>';
    
    // 自己紹介
    html += '<div class="form-group">';
    html += '<label>自己紹介</label>';
    html += '<textarea id="bio" rows="4" maxlength="500" placeholder="例：観葉植物とコーヒーが好きです">' + escapeHtml(currentProfile && currentProfile.bio || '') + '</textarea>';
    html += '<div class="help-text">プロフィールページに表示されます（500文字まで）</div>';
    html += '</div>';
    
    html += '</section>';
    
    // 活動タイプ
    html += '<section class="profile-section">';
    html += '<h3>あなたについて（複数選択可）</h3>';
    
    html += renderTypeCategory('hobby', '🌱 趣味・個人');
    html += renderTypeCategory('business', '🏪 お仕事・お店');
    html += renderTypeCategory('professional', '✨ プロフェッショナル');
    html += renderTypeCategory('other', 'その他');
    
    html += '</section>';
    
// 住所情報
html += '<section class="profile-section">';
html += '<h3>住所情報</h3>';
html += '<p style="font-size: 14px; color: #666; margin-bottom: 20px;">Shopifyから同期された住所です。編集できます。地域イベント表示に使用されます。</p>';

// 郵便番号
html += '<div class="form-group">';
html += '<label>郵便番号</label>';
html += '<input type="text" id="postal_code" value="' + escapeHtml(currentProfile && currentProfile.postal_code || '') + '" maxlength="10" placeholder="例: 170-0013" />';
html += '<div class="help-text">ハイフン付きで入力してください</div>';
html += '</div>';

// 都道府県
html += '<div class="form-group">';
html += '<label>都道府県</label>';
html += '<select id="address_prefecture">';
html += '<option value="">選択してください</option>';

var prefectures = [
  '北海道',
  '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県',
  '茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県',
  '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県', '岐阜県', '静岡県', '愛知県',
  '三重県', '滋賀県', '京都府', '大阪府', '兵庫県', '奈良県', '和歌山県',
  '鳥取県', '島根県', '岡山県', '広島県', '山口県',
  '徳島県', '香川県', '愛媛県', '高知県',
  '福岡県', '佐賀県', '長崎県', '熊本県', '大分県', '宮崎県', '鹿児島県',
  '沖縄県'
];

var currentPrefecture = currentProfile && currentProfile.address_prefecture || '';

prefectures.forEach(function(pref) {
  var selected = pref === currentPrefecture ? ' selected' : '';
  html += '<option value="' + pref + '"' + selected + '>' + pref + '</option>';
});

html += '</select>';
html += '</div>';

// 市区町村
html += '<div class="form-group">';
html += '<label>市区町村</label>';
html += '<input type="text" id="address_city" value="' + escapeHtml(currentProfile && currentProfile.address_city || '') + '" maxlength="50" placeholder="例: 豊島区" />';
html += '</div>';

// 住所1
html += '<div class="form-group">';
html += '<label>住所1（番地）</label>';
html += '<input type="text" id="address_line1" value="' + escapeHtml(currentProfile && currentProfile.address_line1 || '') + '" maxlength="100" placeholder="例: 東池袋1-2-3" />';
html += '</div>';

// 住所2
html += '<div class="form-group">';
html += '<label>住所2（建物名など）</label>';
html += '<input type="text" id="address_line2" value="' + escapeHtml(currentProfile && currentProfile.address_line2 || '') + '" maxlength="100" placeholder="例: ○○マンション101号室" />';
html += '</div>';

// 電話番号
html += '<div class="form-group">';
html += '<label>電話番号</label>';
html += '<input type="tel" id="phone" value="' + escapeHtml(currentProfile && currentProfile.phone || '') + '" maxlength="20" placeholder="例: 03-1234-5678" />';
html += '<div class="help-text">ハイフン付きで入力してください</div>';
html += '</div>';

html += '</section>';
    // 店舗情報
    html += '<section class="profile-section">';
    html += '<div class="form-group">';
    html += '<label class="toggle-label">';
    html += '<input type="checkbox" id="has-shop-toggle" ' + (hasShop ? 'checked' : '') + ' />';
    html += '店舗・事業を運営しています';
    html += '</label>';
    html += '</div>';
    
    html += '<div id="shop-info-section" style="display: ' + (hasShop ? 'block' : 'none') + '">';
    
    // 店舗名
    html += '<div class="form-group">';
    html += '<label>店舗名</label>';
    html += '<input type="text" id="shop-name" value="' + escapeHtml(currentProfile && currentProfile.shop_name || '') + '" maxlength="100" />';
    html += '</div>';
    
    // 店舗住所
    html += '<div class="form-group">';
    html += '<label>店舗住所（公開されます）</label>';
    html += '<input type="text" id="shop-address" value="' + escapeHtml(currentProfile && currentProfile.shop_address || '') + '" placeholder="東京都渋谷区..." maxlength="200" />';
    html += '<div class="help-text">お客様が来店できる住所を入力してください</div>';
    html += '</div>';
    
    // 店舗説明
    html += '<div class="form-group">';
    html += '<label>店舗説明</label>';
    html += '<textarea id="shop-description" rows="3" maxlength="500">' + escapeHtml(currentProfile && currentProfile.shop_description || '') + '</textarea>';
    html += '</div>';
    
    // 求人情報
    html += '<h4>📢 求人・仕事依頼</h4>';
    html += '<div class="form-group">';
    html += '<label>求人情報</label>';
    html += '<textarea id="job-openings" rows="3" maxlength="500" placeholder="例：アルバイトスタッフ募集中（週3日〜OK）">' + escapeHtml(currentProfile && currentProfile.job_openings || '') + '</textarea>';
    html += '<div class="help-text">募集している職種や条件を記載</div>';
    html += '</div>';
    
    html += '<div class="form-group">';
    html += '<label>仕事依頼・PR</label>';
    html += '<textarea id="work-request-info" rows="3" maxlength="500" placeholder="例：植物イベントのワークショップ講師承ります">' + escapeHtml(currentProfile && currentProfile.work_request_info || '') + '</textarea>';
    html += '<div class="help-text">受け付けている仕事内容をPR</div>';
    html += '</div>';
    
    // SNS・Webサイト
    html += '<h4>🔗 SNS・Webサイト</h4>';
    
    // Instagram
    html += '<div class="form-group">';
    html += '<label>Instagram</label>';
    html += '<input type="url" id="instagram-url" value="' + escapeHtml(currentProfile && currentProfile.instagram_url || '') + '" placeholder="https://instagram.com/..." />';
    html += '</div>';
    
    // X (Twitter)
    html += '<div class="form-group">';
    html += '<label>X (Twitter)</label>';
    html += '<input type="url" id="twitter-url" value="' + escapeHtml(currentProfile && currentProfile.twitter_url || '') + '" placeholder="https://x.com/..." />';
    html += '</div>';
    
    // Facebook
    html += '<div class="form-group">';
    html += '<label>Facebook</label>';
    html += '<input type="url" id="facebook-url" value="' + escapeHtml(currentProfile && currentProfile.facebook_url || '') + '" placeholder="https://facebook.com/..." />';
    html += '</div>';
    
    // 公式サイト
    html += '<div class="form-group">';
    html += '<label>公式サイト</label>';
    html += '<input type="url" id="website-url" value="' + escapeHtml(currentProfile && currentProfile.website_url || '') + '" placeholder="https://..." />';
    html += '</div>';
    
    // ヤフオク
    html += '<div class="form-group">';
    html += '<label>ヤフーオークション</label>';
    html += '<input type="url" id="yahoo-auction-url" value="' + escapeHtml(currentProfile && currentProfile.yahoo_auction_url || '') + '" placeholder="https://auctions.yahoo.co.jp/..." />';
    html += '</div>';
    
    // メルカリ
    html += '<div class="form-group">';
    html += '<label>メルカリ</label>';
    html += '<input type="url" id="mercari-url" value="' + escapeHtml(currentProfile && currentProfile.mercari_url || '') + '" placeholder="https://jp.mercari.com/..." />';
    html += '</div>';
    
    html += '</div>'; // shop-info-section
html += '</section>';
    
    // ★★★ 出店イベント選択セクション ★★★
    html += '<section class="profile-section">';
    html += '<h3>📅 出店予定イベント</h3>';
    html += '<p style="font-size: 14px; color: #666; margin-bottom: 20px;">あなたが出店予定のイベントを選択すると、プロフィールページに表示されます</p>';
    
    html += '<div class="event-search-box">';
    html += '<input type="text" id="event-search-input" class="event-search-input" placeholder="イベント名で検索..." />';
    html += '<button type="button" id="event-search-btn" class="event-search-btn">🔍 検索</button>';
    html += '</div>';
    
    html += '<div id="event-results" class="event-results" style="display: none;"></div>';
    
    html += '<div class="selected-events">';
    html += '<h4 style="margin: 0 0 12px 0; font-size: 16px; font-weight: 700;">選択中のイベント</h4>';
    html += '<div id="selected-events-list">';
    html += '<div class="empty-state-small">まだイベントが選択されていません</div>';
    html += '</div>';
    html += '</div>';
    
    html += '</section>';
    
    // フォームアクション
    html += '<div class="form-actions">';
    html += '<button type="submit" class="btn btn-primary" id="save-btn">保存する</button>';
    html += '<button type="button" class="btn btn-secondary" onclick="history.back()">キャンセル</button>';
    html += '</div>';
    
    html += '</form>';
    
    container.innerHTML = html;
  }

  /**
   * 活動タイプカテゴリレンダリング
   */
  function renderTypeCategory(category, title) {
    var types = profileTypes.filter(function(t) {
      return t.category === category;
    });
    
    if (types.length === 0) return '';
    
    var html = '<div class="type-category">';
    html += '<h4>' + title + '</h4>';
    
    types.forEach(function(type) {
      var isChecked = selectedTypes.indexOf(type.type_code) !== -1;
      html += '<label>';
      html += '<input type="checkbox" class="type-checkbox" value="' + type.type_code + '" ' + (isChecked ? 'checked' : '') + ' />';
      html += type.icon_emoji + ' ' + type.display_name;
      html += '</label>';
    });
    
    html += '</div>';
    return html;
  }

  /**
   * イベントリスナー設定
   */
  function attachEventListeners() {
    // フォーム送信
    var form = document.getElementById('profile-form');
    form.addEventListener('submit', handleSubmit);
    
    // 店舗情報トグル
    var shopToggle = document.getElementById('has-shop-toggle');
    shopToggle.addEventListener('change', function() {
      toggleShopInfo(this.checked);
    });
    
    // プロフィール画像アップロード
    var avatarInput = document.getElementById('avatar-input');
    avatarInput.addEventListener('change', handleAvatarUpload);
    
    // ★ イベント検索リスナー
    var eventSearchBtn = document.getElementById('event-search-btn');
    var eventSearchInput = document.getElementById('event-search-input');
    
    if (eventSearchBtn) {
      eventSearchBtn.addEventListener('click', searchEvents);
    }
    
    if (eventSearchInput) {
      eventSearchInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          searchEvents();
        }
      });
    }
    
    // ★ 選択済みイベントを表示
    renderSelectedEvents();
  }

  /**
   * 店舗情報セクション表示切替
   */
  function toggleShopInfo(show) {
    hasShop = show;
    var section = document.getElementById('shop-info-section');
    section.style.display = show ? 'block' : 'none';
  }

  /**
   * プロフィール画像アップロード
   */
  function handleAvatarUpload(event) {
    var file = event.target.files[0];
    if (!file) return;
    
    console.log('📤 画像アップロード開始:', file.name, file.size + 'bytes');
    
    // ファイルサイズチェック（5MB）
    if (file.size > 5 * 1024 * 1024) {
      showError('画像サイズは5MB以下にしてください');
      event.target.value = '';
      return;
    }
    
    // 画像タイプチェック
    if (!file.type.match(/^image\/(jpeg|jpg|png|gif|webp)$/)) {
      showError('JPEG、PNG、GIF、WebP形式の画像を選択してください');
      event.target.value = '';
      return;
    }
    
    showMessage('画像をアップロード中...', 'info');
    
    // ファイル名生成
    var timestamp = new Date().getTime();
    var ext = file.name.split('.').pop();
    var fileName = 'avatars/' + userEmail.replace('@', '_').replace(/[^a-zA-Z0-9_-]/g, '') + '_' + timestamp + '.' + ext;
    
    console.log('📁 アップロード先:', fileName);
    
    // Supabase Storageにアップロード
    supabase.storage
      .from('user-avatars')
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: false
      })
      .then(function(response) {
        if (response.error) throw response.error;
        
        console.log('✅ アップロード成功:', response.data);
        
        // 公開URLを取得
        var publicUrlData = supabase.storage
          .from('user-avatars')
          .getPublicUrl(fileName);
        
        uploadedAvatarUrl = publicUrlData.data.publicUrl;
        console.log('🔗 公開URL:', uploadedAvatarUrl);
        
        // プレビュー更新
        var preview = document.getElementById('avatar-preview');
        if (preview) {
          preview.src = uploadedAvatarUrl;
        } else {
          var container = document.querySelector('.avatar-preview-container');
          if (!container) {
            container = document.createElement('div');
            container.className = 'avatar-preview-container';
            event.target.parentNode.insertBefore(container, event.target);
          }
          container.innerHTML = '<img src="' + uploadedAvatarUrl + '" class="avatar-preview" id="avatar-preview" />';
        }
        
        showMessage('画像のアップロードが完了しました', 'success');
      })
      .catch(function(error) {
        console.error('❌ 画像アップロードエラー:', error);
        showError('画像のアップロードに失敗しました: ' + error.message);
        event.target.value = '';
      });
  }

  /**
   * イベント検索
   */
  function searchEvents() {
    var searchInput = document.getElementById('event-search-input');
    var query = searchInput.value.trim();
    
    console.log('🔍 イベント検索:', query);
    
    var today = new Date();
    var thisMonth = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0');
    var eventUrl = 'https://laixgcjvowdszrtdpxlq.supabase.co/functions/v1/get-events?month=' + thisMonth;
    
    fetch(eventUrl, {
      headers: {
        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxhaXhnY2p2b3dkc3pydGRweGxxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDU2NTM5MTIsImV4cCI6MjA2MTIyOTkxMn0.yAvMili-p_uQMHYlz-fpErgFqX243J5z1zI87VqO63M'
      }
    })
    .then(function(response) {
      return response.json();
    })
    .then(function(data) {
      allEvents = data.events || data.data || [];
      console.log('✅ イベント取得:', allEvents.length + '件');
      
      var todayStr = today.toISOString().slice(0, 10);
      var futureEvents = allEvents.filter(function(event) {
        return event.event_date >= todayStr;
      });
      
      var filteredEvents = futureEvents;
      if (query) {
        filteredEvents = futureEvents.filter(function(event) {
          return event.title.toLowerCase().includes(query.toLowerCase());
        });
      }
      
      renderEventResults(filteredEvents);
    })
    .catch(function(error) {
      console.error('❌ イベント検索エラー:', error);
      showError('イベントの検索に失敗しました');
    });
  }

  /**
   * イベント検索結果を表示
   */
  function renderEventResults(events) {
    var resultsContainer = document.getElementById('event-results');
    
    if (events.length === 0) {
      resultsContainer.innerHTML = '<div class="empty-state-small">該当するイベントが見つかりませんでした</div>';
      resultsContainer.style.display = 'block';
      return;
    }
    
    var html = '';
    
    events.forEach(function(event) {
      var isSelected = selectedEvents.some(function(e) {
        return e.event_id === event.id;
      });
      
      html += '<div class="event-result-item">';
      html += '<div class="event-result-info">';
      html += '<div class="event-result-title">' + escapeHtml(event.title) + '</div>';
      html += '<div class="event-result-date">📅 ' + formatEventDate(event.event_date) + '</div>';
      html += '</div>';
      
      if (isSelected) {
        html += '<button class="event-add-btn" disabled>追加済み</button>';
      } else {
        html += '<button class="event-add-btn" onclick="addEvent(\'' + event.id + '\')">追加</button>';
      }
      
      html += '</div>';
    });
    
    resultsContainer.innerHTML = html;
    resultsContainer.style.display = 'block';
  }

  /**
   * イベント追加
   */
  function addEvent(eventId) {
    var event = allEvents.find(function(e) {
      return e.id === eventId;
    });
    
    if (!event) {
      console.error('イベントが見つかりません:', eventId);
      return;
    }
    
    var alreadyAdded = selectedEvents.some(function(e) {
      return e.event_id === eventId;
    });
    
    if (alreadyAdded) {
      showError('このイベントは既に追加されています');
      return;
    }
    
    selectedEvents.push({
      event_id: event.id,
      title: event.title,
      event_date: event.event_date,
      slug: event.slug
    });
    
    console.log('✅ イベント追加:', event.title);
    
    renderSelectedEvents();
    searchEvents();
  }

  /**
   * イベント削除
   */
  function removeEvent(eventId) {
    selectedEvents = selectedEvents.filter(function(e) {
      return e.event_id !== eventId;
    });
    
    console.log('🗑️ イベント削除:', eventId);
    
    renderSelectedEvents();
    
    var resultsContainer = document.getElementById('event-results');
    if (resultsContainer.style.display === 'block') {
      searchEvents();
    }
  }

  /**
   * 選択済みイベント表示
   */
  function renderSelectedEvents() {
    var container = document.getElementById('selected-events-list');
    
    if (!container) return;
    
    if (selectedEvents.length === 0) {
      container.innerHTML = '<div class="empty-state-small">まだイベントが選択されていません</div>';
      return;
    }
    
    var html = '';
    
    selectedEvents.forEach(function(event) {
      html += '<div class="selected-event-item">';
      html += '<div class="selected-event-info">';
      html += '<div class="event-result-title">' + escapeHtml(event.title) + '</div>';
      html += '<div class="event-result-date">📅 ' + formatEventDate(event.event_date) + '</div>';
      html += '</div>';
      html += '<button class="event-remove-btn" onclick="removeEvent(\'' + event.event_id + '\')">削除</button>';
      html += '</div>';
    });
    
    container.innerHTML = html;
  }

  /**
   * イベント日付フォーマット
   */
  function formatEventDate(dateStr) {
    var date = new Date(dateStr);
    var year = date.getFullYear();
    var month = date.getMonth() + 1;
    var day = date.getDate();
    return year + '年' + month + '月' + day + '日';
  }

  // グローバルに公開
  window.addEvent = addEvent;
  window.removeEvent = removeEvent;

  /**
   * フォーム送信処理
   */
  function handleSubmit(event) {
    event.preventDefault();
    
    console.log('💾 フォーム送信開始');
    
    var saveBtn = document.getElementById('save-btn');
    saveBtn.disabled = true;
    saveBtn.textContent = '保存中...';
    
    showMessage('保存中...', 'info');
    
    // フォームデータ収集
var formData = {
  user_email: userEmail,
  nickname: document.getElementById('nickname').value.trim(),
  username: document.getElementById('username').value.trim().toLowerCase(),
  bio: document.getElementById('bio').value.trim(),
  profile_image_url: uploadedAvatarUrl || 'https://cdn.shopify.com/s/files/1/0658/5332/5495/files/blg2.png?v=1767146489',
      
      // 活動タイプ（配列）
      tags: getSelectedTypes(),
      participating_events: selectedEvents,
// 住所情報
postal_code: document.getElementById('postal_code').value.trim(),
address_prefecture: document.getElementById('address_prefecture').value,
address_city: document.getElementById('address_city').value.trim(),
address_line1: document.getElementById('address_line1').value.trim(),
address_line2: document.getElementById('address_line2').value.trim(),
phone: document.getElementById('phone').value.trim(),
      
      
      // 店舗情報
      has_shop: hasShop,
      shop_name: hasShop ? document.getElementById('shop-name').value.trim() : null,
      shop_address: hasShop ? document.getElementById('shop-address').value.trim() : null,
      shop_description: hasShop ? document.getElementById('shop-description').value.trim() : null,
      job_openings: hasShop ? document.getElementById('job-openings').value.trim() : null,
      work_request_info: hasShop ? document.getElementById('work-request-info').value.trim() : null,
      
      // SNSリンク
      instagram_url: hasShop ? document.getElementById('instagram-url').value.trim() : null,
      twitter_url: hasShop ? document.getElementById('twitter-url').value.trim() : null,
      facebook_url: hasShop ? document.getElementById('facebook-url').value.trim() : null,
      website_url: hasShop ? document.getElementById('website-url').value.trim() : null,
      yahoo_auction_url: hasShop ? document.getElementById('yahoo-auction-url').value.trim() : null,
      mercari_url: hasShop ? document.getElementById('mercari-url').value.trim() : null
    };
    
    // 空文字列をnullに変換
    Object.keys(formData).forEach(function(key) {
      if (formData[key] === '') {
        formData[key] = null;
      }
    });
    
    // バリデーション
    if (!formData.nickname) {
      showError('ニックネームを入力してください');
      saveBtn.disabled = false;
      saveBtn.textContent = '保存する';
      return;
    }
    
if (!formData.username) {
  showError('ユーザー名を入力してください');
  saveBtn.disabled = false;
  saveBtn.textContent = '保存する';
  return;
}

// ユーザー名の形式チェック
var usernamePattern = /^[a-z0-9-_]+$/;
if (!usernamePattern.test(formData.username)) {
  showError('ユーザー名は英数字・ハイフン・アンダースコアのみ使用できます');
  saveBtn.disabled = false;
  saveBtn.textContent = '保存する';
  return;
}

if (formData.username.length < 3) {
  showError('ユーザー名は3文字以上で入力してください');
  saveBtn.disabled = false;
  saveBtn.textContent = '保存する';
  return;
}
console.log('📤 保存データ:', formData);

// ★★★ Edge Function 経由で保存（Shopify同期あり） ★★★
fetch('https://laixgcjvowdszrtdpxlq.supabase.co/functions/v1/process-consultation?action=update_profile', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + supabaseKey
  },
  body: JSON.stringify({
    action: 'update_profile',
    user_email: formData.user_email,
    nickname: formData.nickname,
    username: formData.username,
    bio: formData.bio,
    profile_image_url: formData.profile_image_url,
    tags: formData.tags,
    participating_events: formData.participating_events,
    postal_code: formData.postal_code,
    address_prefecture: formData.address_prefecture,
    address_city: formData.address_city,
    address_line1: formData.address_line1,
    address_line2: formData.address_line2,
    phone: formData.phone,
    has_shop: formData.has_shop,
    shop_name: formData.shop_name,
    shop_address: formData.shop_address,
    shop_description: formData.shop_description,
    job_openings: formData.job_openings,
    work_request_info: formData.work_request_info,
    instagram_url: formData.instagram_url,
    twitter_url: formData.twitter_url,
    facebook_url: formData.facebook_url,
    website_url: formData.website_url,
    yahoo_auction_url: formData.yahoo_auction_url,
    mercari_url: formData.mercari_url
  })
})
  .then(function(response) {
    console.log('📡 レスポンス受信:', response.status, response.statusText);
    
    if (!response.ok) {
      throw new Error('HTTP ' + response.status + ': ' + response.statusText);
    }
    return response.json();
  })
  .then(function(data) {
    console.log('📦 レスポンスデータ:', data);
    
    if (!data.success) {
      throw new Error(data.error || 'プロフィール保存に失敗しました');
    }
    
    console.log('✅ 保存成功（Shopify同期済み）:', data.profile);
    
    // ★ data.profileがある場合のみ更新
    if (data.profile) {
      currentProfile = data.profile;
    }
    
    showMessage('プロフィールを保存しました（配送先住所も更新されました）！ プロフィールページに移動します...', 'success');
    
    setTimeout(function() {
      // ★ usernameを取得（優先順位: data.profile > currentProfile > フォーム入力値）
      var username = (data.profile && data.profile.username) || 
                     (currentProfile && currentProfile.username) || 
                     formData.username;
      
      window.location.href = '/pages/community?user=' + encodeURIComponent(username);
    }, 2000);
  })
  .catch(function(error) {
    console.error('❌ 保存エラー:', error);
    
    if (error.message && error.message.includes('nickname')) {
      showError('このニックネームは既に使用されています。別のニックネームを入力してください。');
    } 
    else if (error.message && error.message.includes('username')) {
      showError('このユーザー名は既に使用されています。別のユーザー名を入力してください。');
    }
    else {
      showError('保存に失敗しました: ' + error.message);
    }
    
    saveBtn.disabled = false;
    saveBtn.textContent = '保存する';
  });
}

  /**
   * 選択された活動タイプを取得
   */
  function getSelectedTypes() {
    var checkboxes = document.querySelectorAll('.type-checkbox:checked');
    var types = [];
    for (var i = 0; i < checkboxes.length; i++) {
      types.push(checkboxes[i].value);
    }
    return types;
  }

  /**
   * メッセージ表示
   */
  function showMessage(message, type) {
    var messageArea = document.getElementById('message-area');
    var className = type === 'success' ? 'success-message' : (type === 'error' ? 'error-message' : 'success-message');
    messageArea.innerHTML = '<div class="' + className + '">' + escapeHtml(message) + '</div>';
    
    // エラー以外は5秒で自動消去
    if (type !== 'error') {
      setTimeout(function() {
        messageArea.innerHTML = '';
      }, 5000);
    }
  }

  /**
   * エラーメッセージ表示
   */
  function showError(message) {
    showMessage(message, 'error');
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