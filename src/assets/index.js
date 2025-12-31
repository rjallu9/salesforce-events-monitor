$(document).ready(function () {

    const vscode = acquireVsCodeApi();
        
    const loadOrgs = () => {
        vscode.postMessage({ command: 'getAuthOrgs', refresh:false });
    };

    loadOrgs();

    $("#tabs").tabs();
    $("#tabs").hide();
    $('#event-lists-dialog').dialog({autoOpen: false, modal: true, closeOnEscape: true, width: 750, height:550});
    $('#payload-dialog').dialog({autoOpen: false, modal: true, closeOnEscape: true, width: 750, height:550});

    let orgs = [];  
    let events = [];  
    let publishEvents = [];  
    let messages = [];   
    let selectedEvents = new Set();
    let subscribedEvents = new Set();
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
                $('#publishEventsDD').attr('disabled', false);
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
                $('#eventsDD').attr('disabled', false);
                refreshEventsView(); 
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
        } else if(event.data.command === 'subscribed') {
            subscribedEvents.add(event.data.name); 
            selectedEvents.delete(event.data.name); 
            $('.dd-text-field').attr("placeholder", selectedEvents.size > 0 ? selectedEvents.size + ' Event(s) Selected' : '');             
            $('#replayOptions').val('-1');
            $('#replayOptions').prop('disabled', selectedEvents.size === 0);
            $('#subscribeBtn').prop('disabled', selectedEvents.size === 0);

            $('#viewSubEventsBtn').attr('disabled', subscribedEvents.size === 0);
            $('#viewSubEventsBtn').text('All Subscribed Events ('+subscribedEvents.size+')');
            $('.dd-option-chk').each(function() {
                if($(this).val() === event.data.name) {
                    $(this).attr('disabled', true);
                    $(this).parent().removeClass('select-row');
                    $(this).parent().addClass('sub-row');
                    $(this).parent().parent().removeClass('select-row');
                    $(this).parent().parent().addClass('sub-row');
                }
            });
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
            $('#tabs').show(); 

            $('#eventTypes').val(''); 
            $('.dd-text-field').attr('disabled', true);
            $('.dd-text-field').attr("placeholder", ''); 
            $('#replayOptions').prop('disabled', true);
            $('#subscribeBtn').prop('disabled', selectedEvents.size === 0);
            $('#viewSubEventsBtn').attr('disabled', true);
            $('#viewSubEventsBtn').attr('placeholder', 'All Subscribed Events (0)');

            subscribedEvents.clear(); 
            selectedEvents.clear();
            messages = []; 
            $('#messagesList').DataTable().clear().rows.add(messages).draw();
            $('#export').prop('disabled',true);  
            $('#clear').prop('disabled',true);

            publishedMessages = [];
            $('#publishEventTypes').val('');            
            $('#publishEventsDD').attr('disabled', true);
            $('#publishList').DataTable().clear().rows.add(publishedMessages).draw();
        } else {
            $('#tabs').hide();
        }     
    });

    $('#eventTypes').on("change", function(e){ 
        events = [];        
        selectedEvents.clear();
        refreshEventsView();   
        $('#eventsDD').attr('disabled', true);
        if($(this).val() !== '') {
            $('.dd-text-field').attr('disabled', false);
            vscode.postMessage({ command: 'getEvents', source:'subscribe', orgId: $('#org-field').val(), type: $(this).val()});            
            $("#spinner").show();   
            $(".spinnerlabel").text("Refreshing Events");
        } else {
            $('.dd-text-field').attr('disabled', true);
            $('.dd-text-field').attr("placeholder", ''); 
            $('#replayOptions').prop('disabled', true);
            $('#subscribeBtn').prop('disabled', selectedEvents.size === 0);
        }    
    });

    function refreshEventsView() {
        $('.dd-options ui').empty();
        var visibleTypesCount = 0;
        events.forEach(function(evt) {
            if(!evt.hidden) {
                if(subscribedEvents.has(evt.url)) {                   
                    $('.dd-options ui').append(`
                        <li class="dd-option sub-row">
                            <div class='sub-row'>
                                <input type="checkbox" value=${evt.url} id=${evt.name} class="dd-option-chk" checked disabled>
                                <label class="dd-option-lbl" for=${evt.name}>${evt.label}</label>
                            </div>
                        </li>
                    `);
                } else if(selectedEvents.has(evt.url)) {                   
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
                visibleTypesCount++;
            }
        });
        if(events.length === visibleTypesCount && events.length > subscribedEvents.size) {
            $('#select-all-div').show();
            $('.dd-select-all').prop('checked', (selectedEvents.size+subscribedEvents.size) === events.length);
        } else {
            $('#select-all-div').hide();
        }    
    }

    $(".dd-text-field").on("click", function(e){
        e.stopPropagation();
		if ($(".dd-option-box").is(":hidden")) {            
            $(".dd-option-box").show();
            $(".dd-option-box").css({width: $(this).outerWidth()});
            events.forEach(function(evt) {
                evt.hidden = false;           
            });
            refreshEventsView();
        } 
	});

    $(".dd-text-field").on("input", function(e){
		const txt = $(this).val().toLowerCase();
        events.forEach(function(evt) {
            evt.hidden = txt !== '' ? !evt.label.toLowerCase().startsWith(txt) : false;           
        });
        refreshEventsView();
    });

    $('.dd-option-box').on('click', function (e) {
        e.stopPropagation();
    });

    $("body").on("click",function(e){
        $(".dd-text-field").val('');
        $(".dd-option-box").hide();
	});

    $(document).keydown(function(e) {
        if (e.key === "Escape") {
            $(".dd-text-field").val('');
           $(".dd-option-box").hide();
        }
    });
    $(document).mousedown(function(e) {
       if($(e.target)[0]?.classList[0]?.startsWith('dd-')) {
            return;
       } else {
            $(".dd-text-field").val('');
            $(".dd-option-box").hide();
       }
    });

    $(document).on('change', '.dd-option-chk', function() {
        if ($(this).is(':checked')) {
            $(this).parent().addClass('select-row');
            $(this).parent().parent().addClass('select-row');
            selectedEvents.add($(this).val());      
        } else {
            $(this).parent().removeClass('select-row');
            $(this).parent().parent().removeClass('select-row');
            selectedEvents.delete($(this).val());  
        }        
        $('.dd-text-field').attr("placeholder", selectedEvents.size+ ' Event(s) Selected'); 
        $('#replayOptions').prop('disabled', selectedEvents.size === 0);
        $('#subscribeBtn').prop('disabled', selectedEvents.size === 0);
        $('.dd-select-all').prop('checked', selectedEvents.size === events.length);
        if(selectedEvents.size === 1) {
            $('#customReplayId').show();
        } else {
            $('#customReplayId').hide();
            if($('#replayOptions').val() === '0') {
                $('#replayOptions').val('-1');
                $('#replayIdDD').hide();
            }
        }
    });

    $(document).on('change', '.dd-select-all', function() {
        if ($(this).is(':checked')) {
            $('.dd-option-chk').each(function(indx, chxbox) {
                if(!$(chxbox).prop('checked')) {
                    $(chxbox).prop('checked', true);
                    $(chxbox).parent().addClass('select-row');
                    $(chxbox).parent().parent().addClass('select-row');
                    selectedEvents.add($(chxbox).val());  
                }                
            });
        } else {
            $('.dd-option-chk').each(function(indx, chxbox) {
                if(!subscribedEvents.has($(chxbox).val())) {
                    $(chxbox).prop('checked', false);
                    $(chxbox).parent().removeClass('select-row');
                    $(chxbox).parent().parent().removeClass('select-row');
                    selectedEvents.delete($(chxbox).val());   
                }                              
            });
        }
        $('.dd-text-field').attr("placeholder", selectedEvents.size+ ' Event(s) Selected'); 
        $('#replayOptions').prop('disabled', selectedEvents.size === 0);
        $('#subscribeBtn').prop('disabled', selectedEvents.size === 0);
        if(selectedEvents.size === 1) {
            $('#customReplayId').show();
        } else {
            $('#customReplayId').hide();
            if($('#replayOptions').val() === '0') {
                $('#replayOptions').val('-1');
                $('#replayIdDD').hide();
            }
        }
    });

    $('#replayOptions').on("change", function(e){ 
        $('#replayIdDD').hide();
        $('#replayId').val('');
        if($(this).val() === '0') {
            $('#replayIdDD').show();
            $('#subscribeBtn').prop('disabled', true);
        } 
    });

    $('#replayId').on("input", function(e){ 
        $('#subscribeBtn').prop('disabled', true); 
        if($(this).val() !== '') {
            $('#subscribeBtn').prop('disabled', false);
        }     
    });

    $("#subscribeBtn").on("click", function(e){
        vscode.postMessage({ command: 'subscribe', orgId: $("#org-field").val(), 
            events:[...selectedEvents].join(), replayId:$("#replayOptions").val() === '0' ? $("#replayId").val() : $("#replayOptions").val()});
    });

    $("#viewSubEventsBtn").on("click", function(e){
        var tmp = [];
        subscribedEvents.forEach(evt => {
            tmp.push({name: evt, action: `<a href="#" style="color:#4daafc" class='unsubscribe' data-event="${evt}">Unsubscribe</a>`});
        }); 
        $('#event-lists-dialog').dialog("open");        
        $('#eventList').DataTable().clear().rows.add(tmp).draw(); 
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

    $("#viewSubEventsBtn").on("click", function(e){
        var tmp = [];
        subscribedEvents.forEach(evt => {
            tmp.push({name: evt, action: `<a href="#" style="color:#4daafc" class='unsubscribe' data-event="${evt}">Unsubscribe</a>`});
        }); 
        $('#event-lists-dialog').dialog("open");        
        $('#eventList').DataTable().clear().rows.add(tmp).draw(); 
    }); 

    $("#eventList").on('click', 'a.unsubscribe', function (e) {
        let filename = e.currentTarget.dataset.event;
        subscribedEvents.delete(filename);
        selectedEvents.delete(filename);
        vscode.postMessage({ command: 'unsubscribe', orgId: $("#org-field").val(), event:filename});   
        var tmp = [];
        subscribedEvents.forEach(evt => {
            tmp.push({name: evt, action: `<a href="#" style="color:#4daafc" class='unsubscribe' data-event="${evt}">Unsubscribe</a>`});
        });       
        $('#eventList').DataTable().clear().rows.add(tmp).draw(); 

        $('.dd-text-field')
        $('.dd-text-field').attr("placeholder", selectedEvents.size+ ' Event(s) Selected'); 
        $('.dd-option-chk').each(function() {
            if($(this).val() === filename) {
                $(this).prop('checked', false);
                $(this).parent().removeClass('select-row');
                $(this).parent().parent().removeClass('select-row');
            }
        });
        $('#viewSubEventsBtn').attr('disabled', subscribedEvents.size  === 0 );
        $('#viewSubEventsBtn').text('All Subscribed Events ('+subscribedEvents.size+')');
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
            { data: 'createdDate', "type": "date"},
            { data: 'payload'},
            { data: 'view'}
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
            { "width": "60%", "targets": 3 },
            {       
                "width": "10%", 
                "targets": 4,
                render: function (data, type, row) {
                    return '<a href="#" class="payloadview" style="color:#4daafc">View</a>';
                },
            }
        ]
    });

    $("#messagesList").on('click', 'a.payloadview', function (e) {
        let payload = $('#messagesList').DataTable().row($(this).parent().parent()).data().payload;
        $('#payloadview').val(JSON.stringify(JSON.parse(payload), null, 4));
        $('#payload-dialog').dialog("open");
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
            { data: 'eventId'},            
            { data: 'payload'},
            { data: 'view'}
        ],
        language: {
            emptyTable: 'No events published',
            info: "Total: _TOTAL_ event(s) published"
        },        
        autoWidth: false,
        columnDefs: [
            { "width": "20%", "targets": 0 },
            { "width": "10%", "targets": 1 },            
            { "width": "70%", "targets": 2 },
            {       
                "width": "10%", 
                "targets": 3,
                render: function (data, type, row) {
                    return '<a href="#" class="payloadview" style="color:#4daafc">View</a>';
                },
            }
        ]
    });

    $("#publishList").on('click', 'a.payloadview', function (e) {
        let payload = $('#publishList').DataTable().row($(this).parent().parent()).data().payload;
        $('#payloadview').val(JSON.stringify(JSON.parse(payload), null, 4));
        $('#payload-dialog').dialog("open");
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

    $(".tab").on('click', function (e) {
        if($('#'+e.currentTarget.attributes.name.value).DataTable().page() === 0) {
            $('#'+e.currentTarget.attributes.name.value).DataTable().draw(); 
        }        
    });
});

