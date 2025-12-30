$(document).ready(function () {

    const vscode = acquireVsCodeApi();
        
    const loadOrgs = () => {
        vscode.postMessage({ command: 'getAuthOrgs', refresh:false });
    };

    loadOrgs();

    $("#tabs").tabs();
    $("#tabs").hide();
    $('#event-lists-dialog').dialog({autoOpen: false, modal: true, closeOnEscape: true, width: 750, height:550});

    let orgs = [];  
    let events = [];  
    let publishEvents = [];  
    let messages = [];   
    let selectedEvents = new Set();
    let selectedEventsAll = new Set();
    let publishedMessages = [];  

    window.addEventListener('message', (event) => {
        if(event.data.command === 'orgsList') {
            orgs = event.data.orgs;
            $("#org").show();
            $("#org-refresh").show();
            $("#spinner").hide();
            loadSourceOrgs();
        } else if(event.data.command === 'loading') {
            $(".spinnerlabel").text(event.data.message);       
        } else if(event.data.command === 'error') {
            $("#errors").text(event.data.message);   
            $("#spinner").hide();
        } else if(event.data.command === 'events') {
            if(event.data.source === 'publish') {
                event.data.components.forEach(function(evt) {
                    publishEvents.push(evt);
                });
                $('#publishEventsDD').show();
                $.each(publishEvents, function(index, option) {
                    $('<option/>', {
                        value: option.name,
                        text: option.label
                    }).appendTo($('#publishEvents'));
                });
            } else {
                event.data.components.forEach(function(evt) {
                    events.push(evt);
                });
                $('#eventsDD').show();
                refreshEvents(); 
            }              
            $("#spinner").hide(); 
        } else if(event.data.command === 'message') {
            messages.push({
                name: event.data.name,
                createdDate: event.data.message.event.createdDate ?? event.data.message.payload.LastModifiedDate ?? event.data.message.payload.CreatedDate,
                payload: JSON.stringify(event.data.message.sobject ?? event.data.message.payload),
                replayId: event.data.message.event.replayId
            });
            $('#messagesList').DataTable().clear().rows.add(messages).draw();   
            $('#export').prop('disabled',false);  
            $('#clear').prop('disabled',false);
        } else if(event.data.command === 'publishedmessage') {
            publishedMessages.push({
                name: event.data.name,
                payload: event.data.payload,
                eventId: event.data.eventId
            });
            $('#publishList').DataTable().clear().rows.add(publishedMessages).draw(); 
        } 
    });

    function loadSourceOrgs() {
        $('#org-field').empty();
        $('#org-field').append($("<option>").val('').text(''));
        orgs.forEach(org => {
            $('#org-field').append($("<option>").val(org.orgId).text(org.name));
        });
    } 

    $("#org-refresh").on('click', function (e) {
        vscode.postMessage({ command: 'getAuthOrgs', refresh:true});
        $("#spinner").show();   
        $(".spinnerlabel").text("Refreshing Orgs");
    });

    $('#org-field').on("change", function(e){   
        vscode.postMessage({ command: 'unsubscribeAll'});   
        if($(this).val() !== '') {
            $('#eventTypes').val(''); 
            $('#publishEventTypes').val('');         
            $('#tabs').show();  
            $('#eventsDD').hide();
            $('#publishEventsDD').hide();
            $('#subEvents').hide();
            selectedEventsAll.clear(); 
            messages = []; 
            $('#messagesList').DataTable().clear().rows.add(messages).draw();
            $('#export').prop('disabled',true);  
            $('#clear').prop('disabled',true);
            publishedMessages = [];
            $('#publishList').DataTable().clear().rows.add(publishedMessages).draw();
        } else {
            $('#tabs').hide();
        }     
    });

    $('#eventTypes').on("change", function(e){ 
        events = [];
        refreshEvents();   
        $('#eventsDD').hide(); 
        if($(this).val() !== '') {
            vscode.postMessage({ command: 'getEvents', source:'subscribe', orgId: $('#org-field').val(), type: $(this).val()});            
            $("#spinner").show();   
            $(".spinnerlabel").text("Refreshing Events");
        }     
    });

    function refreshEvents() {
        selectedEvents.clear();
        $('.dd-options ui').empty();
        events.forEach(function(evt) {
            if(!evt.hidden) {
                if(selectedEventsAll.has(evt.url)) {
                    selectedEvents.add(evt.url, evt);                    
                    $('.dd-options ui').append(`
                        <li class="dd-option select-row">
                            <div class='select-row'>
                                <input type="checkbox" value=${evt.url} id=${evt.name} class="dd-option-chk" checked>
                                <label class="dd-option-lbl" for=${evt.name}>${evt.label}</label>
                            </div>
                        </li>
                    `);
                } else {                    
                    $('.dd-options ui').append(`
                        <li class="dd-option">
                            <div>
                                <input type="checkbox" value=${evt.url} id=${evt.name} class="dd-option-chk">
                                <label class="dd-option-lbl" for=${evt.name}>${evt.label}</label>
                            </div>
                        </li>
                    `);
                }
            }
        }); 
        $('.dd-text-field').attr("placeholder", selectedEvents.size+ ' Event(s) subscribed');    
    }

    $(".dd-text-field").on("click", function(e){
        e.stopPropagation();
		$(".dd-option-box").show();
        $(".dd-option-box").css({width: $(this).outerWidth()});
	});

    $(".dd-text-field").on("input", function(e){
		const txt = $(this).val().toLowerCase();
        types.forEach(function(type) {
            type.hidden = txt !== '' ? !type.name.toLowerCase().startsWith(txt) : false;           
        });
        refreshTypes();
    });

    $('.dd-option-box').on('click', function (e) {
        e.stopPropagation();
    });

    $("body").on("click",function(e){
        $(".dd-option-box").hide();
	});

    $(document).keydown(function(e) {
        if (e.key === "Escape") {
           $(".dd-option-box").hide();
        }
    });
    $(document).mousedown(function(e) {
       if($(e.target)[0]?.classList[0]?.startsWith('dd-')) {
            return;
       } else {
            $(".dd-option-box").hide();
       }
    });

    $(document).on('change', '.dd-option-chk', function() {
        if ($(this).is(':checked')) {
            $(this).parent().addClass('select-row');
            $(this).parent().parent().addClass('select-row');
            selectedEvents.add($(this).val());
            selectedEventsAll.add($(this).val());
            vscode.postMessage({ command: 'subscribe', orgId: $("#org-field").val(), event:$(this).val()});         
        } else {
            $(this).parent().removeClass('select-row');
            $(this).parent().parent().removeClass('select-row');
            selectedEvents.delete($(this).val());
            selectedEventsAll.delete($(this).val());
            vscode.postMessage({ command: 'unsubscribe', orgId: $("#org-field").val(), event:$(this).val()});   
        }        
        $('.dd-text-field').attr("placeholder", selectedEvents.size+ ' Event(s) subscribed'); 
        if(selectedEventsAll.size > 0) {  
            $('#subEvents').show();
            $('#subEvents').text('All Subscribed Events ('+selectedEventsAll.size+')');
        } else {
            $('#subEvents').hide();
        }
    });

    $('#eventList').DataTable({
        paging: true,
        pageLength: 10,
        lengthChange: false,
        scrollY: '400px',
        scrollCollapse: true, 
        fixedColumns: true,
        order: [[1, 'desc']],
        columns: [
            { data: 'name'},
            { data: 'action'}
        ],
        autoWidth: false,
        columnDefs: [
            { "width": "70%", "targets": 0 },
            { "width": "30%", "targets": 1 }
        ]
    });

    $("#subEvents").on("click", function(e){
        var tmp = [];
        selectedEventsAll.forEach(evt => {
            tmp.push({name: evt, action: `<a href="#" style="color:#4daafc" class='unsubscribe' data-event="${evt}">Unsubscribe</a>`});
        }); 
        $('#event-lists-dialog').dialog("open");        
        $('#eventList').DataTable().clear().rows.add(tmp).draw(); 
    });  

    $("#eventList").on('click', 'a.unsubscribe', function (e) {
        let filename = e.currentTarget.dataset.event;
        selectedEventsAll.delete(filename);
        selectedEvents.delete(filename);
        vscode.postMessage({ command: 'unsubscribe', orgId: $("#org-field").val(), event:filename});   
        var tmp = [];
        selectedEventsAll.forEach(evt => {
            tmp.push({name: evt, action: `<a href="#" style="color:#4daafc" class='unsubscribe' data-event="${evt}">Unsubscribe</a>`});
        });       
        $('#eventList').DataTable().clear().rows.add(tmp).draw(); 

        $('.dd-text-field')
        $('.dd-text-field').attr("placeholder", selectedEvents.size+ ' Event(s) subscribed'); 
        $('.dd-option-chk').each(function() {
            if($(this).val() === filename) {
                $(this).prop('checked', false);
                $(this).parent().removeClass('select-row');
                $(this).parent().parent().removeClass('select-row');
            }
        });
        if(selectedEventsAll.size > 0) {  
            $('#subEvents').show();
            $('#subEvents').text('All Subscribed Events ('+selectedEventsAll.size+')');
        } else {
            $('#subEvents').hide();
        }
    });

    $('#messagesList').DataTable({
        paging: true,
        pageLength: 100,
        lengthChange: false,
        scrollY: '400px',
        scrollCollapse: true, 
        fixedColumns: true,
        order: [[1, 'desc']],
        columns: [
            { data: 'name'},
            { data: 'replayId'},
            { data: 'createdDate'},
            { data: 'payload'}
        ],
        language: {
            emptyTable: 'No events captured',
            info: "Total: _TOTAL_ event(s) captured"
        },        
        autoWidth: false,
        columnDefs: [
            { "width": "10%", "targets": 0 },
            { "width": "10%", "targets": 1 },
            { "width": "10%", "targets": 2 },
            { "width": "70%", "targets": 3 }
        ]
    });

    $('#export').on('click', function (e) {
        let list = [['Event Name','Replay Id', 'Created Date', 'Payload']];
        messages.forEach(e => {
            list.push(['"'+e.name+'"', '"'+e.replayId+'"', '"'+e.createdDate+'"', '"'+e.payload.replaceAll('"', '')+'"']);
        });
        navigator.clipboard.writeText(list.map(e => e.join(",")).join("\n"));
        vscode.postMessage({ command: 'toastMessage', message: 'CSV content copied to clipboard'});
    });

    $('#clear').on('click', function (e) {
        messages = [];
        $('.messages').text('Messages ('+messages.length+')');
        $('#messagesList').DataTable().clear().rows.add(messages).draw();
        $('#export').prop('disabled', true);  
        $('#clear').prop('disabled', true);
    });

    $('#publishList').DataTable({
        paging: true,
        pageLength: 100,
        lengthChange: false,
        scrollY: '400px',
        scrollCollapse: true, 
        fixedColumns: true,
        order: [[1, 'desc']],
        columns: [
            { data: 'name'},
            { data: 'payload'},
            { data: 'eventId'},
        ],
        language: {
            emptyTable: 'No events published',
            info: "Total: _TOTAL_ event(s) published"
        },        
        autoWidth: false,
        columnDefs: [
            { "width": "20%", "targets": 0 },
            { "width": "70%", "targets": 1 },
            { "width": "10%", "targets": 2 }
        ]
    });

    $('#publishEventTypes').on("change", function(e){ 
        publishEvents = [];
        $('#publishEventsDD').hide(); 
        if($(this).val() !== '') {
            vscode.postMessage({ command: 'getEvents', source:'publish', orgId: $('#org-field').val(), type: $(this).val()});            
            $("#spinner").show();   
            $(".spinnerlabel").text("Refreshing Events");
        }     
    });

    $('#publishEvents').on("change", function(e){ 
        $('#publishPayload').hide(); 
        if($(this).val() !== '') {
            $('#payload').val('');
            $('#publishBtn').prop('disabled', true);
            $('#publishPayload').show(); 
        }     
    });

    $("#payload").on("input", function(e){
        $('#publishBtn').prop('disabled', $(this).val() === '');
    });

    $('#publishBtn').on('click', function (e) {
        vscode.postMessage({ command: 'publish', orgId: $('#org-field').val(), type: $('#publishEvents').val(), payload: $('#payload').val()});    
    });
});

