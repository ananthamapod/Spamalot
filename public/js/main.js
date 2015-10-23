$(document).ready(function() {

  // Place JavaScript code here...
  $('div.add-target input.btn-success[value="Add"]').on('click', function() {
    var fields = $('div.add-target input[type="text"]');
    var option = $('div.add-target select option:selected');

    var valid = true;

    var data = {};

    fields.each(function(i, obj) {
      if(obj.value === "") {
        valid = false;
      }
      data[obj.name] = obj.value;
    });
    console.log(option);

    if(valid) {
      data.message = option.val();
      data._csrf = $('input[name="_csrf"]')[0].value;
      console.log(data);
      $.post("http://localhost:3000/target", data, function(msg) {
        $( ".message" ).html( msg );
        console.log("sent");
      });
    }
  })

});
