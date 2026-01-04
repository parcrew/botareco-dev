      var galleryThumbs = new Swiper('.gallery-thumbs', {
            spaceBetween: 10,
            slidesPerView: 'auto',
            loop: false,
 autoHeight: !0,
            watchSlidesVisibility: true,
            watchSlidesProgress: true,
            nested: true,
        });

        var galleryTop = new Swiper('.gallery-top', {
            spaceBetween: 10,
            loop: true,
            autoHeight: true,
            navigation: {
                nextEl: '.swiper-button-next',
                prevEl: '.swiper-button-prev',
            },
            thumbs: {
                swiper: galleryThumbs,
            },
            on: {
                init: function () {
                    this.updateAutoHeight();
                },
                slideChange: function () {
                    this.updateAutoHeight();
                }
            }
        });

        var innerSlider1 = new Swiper('.inner-slider-1', {
            slidesPerView: 'auto',
            spaceBetween: 10,
            navigation: {
                nextEl: '.inner-next',
                prevEl: '.inner-prev',
            },
            loop: false,
            freeMode: true,
            grabCursor: true,
            nested: true,
        });