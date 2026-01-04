$(function() {
  $("#glossary-grid").isotope({
    itemSelector: ".glossary-item",
    layoutMode: "fitRows",
    filter: ".glossary-item, .glossary-item:not(.hide-this-item)"
  });

  $(".btn-glossary-filter").on("click", function(evt) {
    $("#glossary-grid").isotope({
      filter: ".glossary-filter_" + $(this).text() + ":not(.hide-this-item)",
      layoutMode: "fitRows"
    });
  });

  $("#glossary-search-exp").on("keyup", function(evt) {
 
    var search_exp;
    search_exp = $(this).val();

    $(".glossary-item").each(function(index) {
      var card_title;
      $(this).removeClass("hide-this-item");
      card_title = $(this)
        .find(".card-title")
        .text();
      if (card_title.toLowerCase().indexOf(search_exp.toLowerCase()) >= 0) {
        return console.log(card_title);
      } else {
        return $(this).addClass("hide-this-item");
      }
    });

    $("#glossary-grid").isotope({
      itemSelector: ".glossary-item",
      layoutMode: "fitRows",
      filter: ".glossary-item:not(.hide-this-item)"
    });
  });

  
  $("#glossary-search-exp").on("focus", function(evt) {
    
  });

  $("#glossary-search-exp").on("focusout", function(evt) {
    
  });
  
});