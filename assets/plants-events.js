document.addEventListener('DOMContentLoaded', function() {
    const yearTabs = document.querySelectorAll('.plants-year-tab');
    const newsContents = document.querySelectorAll('.plants-news-year-content');

    yearTabs.forEach(tab => {
        tab.addEventListener('click', function() {
            const targetYear = this.getAttribute('data-year');

            // すべてのタブから active クラスを削除
            yearTabs.forEach(t => t.classList.remove('active'));
            // クリックされたタブに active クラスを追加
            this.classList.add('active');

            // すべてのニュースコンテンツを非表示
            newsContents.forEach(content => content.classList.remove('active'));
            // 対象年度のニュースコンテンツを表示
            const targetContent = document.querySelector(`.plants-news-year-content[data-year="${targetYear}"]`);
            if (targetContent) {
                targetContent.classList.add('active');
            }
        });
    });
});
