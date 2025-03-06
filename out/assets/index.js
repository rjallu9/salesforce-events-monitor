$(document).ready(function () {
    const vscode = acquireVsCodeApi();
        
    const loadOrgs = () => {
        vscode.postMessage({ command: 'getAuthOrgs' });
    };

    loadOrgs();

    let orgs = [];  
    let events = [];  

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
        } else if(event.data.command === 'message') {
            events.push({
                name: event.data.name,
                payload: JSON.stringify(event.data.message.payload),
                replayId: event.data.message.event.replayId
            });
            $('#eventsList').DataTable().clear().rows.add(events).draw();      
        } 
    });

    function loadSourceOrgs() {
        $('#org-field').empty();
        $('#org-field').append($("<option>").val('').text(''));
        orgs.forEach(org => {
            $('#org-field').append($("<option>").val(org.orgId).text(org.name));
        });
    } 

    $('#subscribe').on("click", function(e){    
        vscode.postMessage({ command: 'subscribe', orgId: $("#org-field").val()});  
    });

    $('#eventsList').DataTable({
        paging: true,
        pageLength: 100,
        lengthChange: false,
        scrollY: '400px',
        scrollCollapse: true, 
        fixedColumns: true,
        order: [[2, 'desc']],
        columns: [
            { data: 'name', width:'300px' },
            { data: 'replayId', width:'100px' },
            { data: 'payload' }
        ],
        language: {
            emptyTable: 'No events captured',
            info: "Total: _TOTAL_ event(s) captured"
        }
    });
});

