import * as vscode from 'vscode';
const path = require('path');
const axios = require('axios');
const xml2js = require('xml2js');
const { exec } = require('child_process');
const fs = require('fs');
import eventsSet from './assets/events.json';
const faye = require('faye');

let tmpDirectory = '';
let EVENTS_SET = eventsSet;
let orgsList: any[] = [];
var orgsListPath = '';
var fsPath = '';
var vsContext: vscode.ExtensionContext;
let globalStorageUri = '';

export function activate(context: vscode.ExtensionContext) {
	const disposable = vscode.commands.registerCommand('salesforce-events-monitor.build', () => {
			const panel = vscode.window.createWebviewPanel(
				'packageBuilder',
				'Salesforce Events Monitor',
				vscode.ViewColumn.One,
				{ enableScripts: true, retainContextWhenHidden: true }
			);
			const scriptPath = vscode.Uri.file(
				path.join(context.extensionPath, 'out', 'assets/index.js')
			);
			const scriptUri = panel.webview.asWebviewUri(scriptPath);
			const cssPath = vscode.Uri.file(
				path.join(context.extensionPath, 'out', 'assets/index.css')
			);
			const cssUri = panel.webview.asWebviewUri(cssPath);

			panel.webview.html = getWebviewContent(context.extensionPath, scriptUri, cssUri);

			let subscribeList = new Map();
			let eventsList = new Map();

			vsContext = context;
			tmpDirectory = context.globalStorageUri.fsPath+"/tmp";
			fsPath = context.globalStorageUri.fsPath;
			orgsListPath = path.join(context.globalStorageUri.fsPath, 'orgsListV3.json');

			panel.webview.onDidReceiveMessage((message) => {
				switch (message.command) {
					case 'getAuthOrgs':	
						if (fs.existsSync(orgsListPath)) {
							orgsList = JSON.parse(fs.readFileSync(orgsListPath, 'utf-8'));
							Promise.all(
								orgsList.map(org =>
									Promise.all([
										vsContext.secrets.get(`sf-access-token-${org.orgId}`),
										vsContext.secrets.get(`sf-refresh-token-${org.orgId}`)
									]).then(([accessToken, refreshToken]) => ({
										...org,
										accessToken,
										refreshToken
									}))
								)
							).then((orgsWithTokens) => {
								orgsList = orgsWithTokens;
								if(!message.refresh) {
									panel.webview.postMessage({ command: 'orgsList', orgs: orgsList});
								}
							});								
						} 
						
						if(message.refresh || !fs.existsSync(orgsListPath)) {
							getAuthOrgs().then((result:any) => {
								panel.webview.postMessage({command: 'orgsList', orgs: orgsList});		
							}).catch((error) => {
								panel.webview.postMessage({ command: 'error', message:`Unable to load authorized orgs. ${error}`});
							});	
						}				
						break;
					case 'getEvents':			
						var org = orgsList.find((org:any) => org.orgId === message.orgId);
						if(eventsList.has(org.orgId+message.type)) {
							panel.webview.postMessage({ command: 'events', source:message.source, components: eventsList.get(org.orgId+message.type)});
						} else {
							validateSession(message.orgId)
							.then((result:
								any) => {
								if(result.valid) {
									getEvents(message.orgId, message.type)
										.then((data:any) => {
											panel.webview.postMessage({ command: 'events', source:message.source, components: data});						
									});	
								}
							}).catch((error) => {
								panel.webview.postMessage({ command: 'error', message:'Unable to connect to the Org.' });
							});		
						}		
						break;
					case 'subscribe':			
						var org = orgsList.find((org:any) => org.orgId === message.orgId);
						const client = new faye.Client(`${org.instanceUrl}/cometd/${org.apiVersion}/`);
						client.setHeader('Authorization', `Bearer ${org.accessToken}`);
						let channelReplays = {"replay": {}};
						message.events.split(',').forEach((channel:any) => {
							(channelReplays.replay as any)[channel] = parseInt(message.replayId);
						});
						client.addExtension({
								outgoing: (msg:any, callback:any) => {
									msg.ext = channelReplays;
									callback(msg);
								}
						});
						message.events.split(',').forEach((channel:any) => {
							const subscribe = client.subscribe(channel, (msg:any) => {	
								panel.webview.postMessage({ command: 'message', message: msg, name:channel});									
							});
							subscribe.callback((msg:any) => {	
								panel.webview.postMessage({ command: 'subscribed', name:channel});								
								vscode.window.showInformationMessage(`Successfully Subscribed to ${channel}`);
								subscribeList.set(channel, subscribe);
							});
							subscribe.errback((err:any) => {
								vscode.window.showErrorMessage(`Failed to Subscribed to ${channel} Error: ${err}`);
							});	
						});
						break;
					case 'unsubscribe':			
						var subscription = subscribeList.get(message.event);		
						subscription.cancel();	
						subscribeList.delete(message.event);
						vscode.window.showInformationMessage(`Successfully Unsubscribed to ${message.event}`);	
						break;
					case 'publish':			
						var org = orgsList.find((org:any) => org.orgId === message.orgId);
						axios.post(org.instanceUrl+`/services/data/v${org.apiVersion}/sobjects/`+message.type, message.payload, 
							{   
								headers: {
									'Content-Type': 'application/json; charset=utf-8',
									'Authorization': `Bearer ${org.accessToken}`
								},
							}
						).then((response:any) => {
							vscode.window.showInformationMessage(`Event published successfully. Event ID: ${response.data.id}`);
							panel.webview.postMessage({ command: 'publishedmessage', payload: message.payload, name:message.type, eventId: response.data.id});	
						})
						.catch((error:any) => {
							vscode.window.showErrorMessage(`Failed to publish event. Error: ${error.code} : ${error.response?.data[0]?.message }`);
						});
						break;
					case 'toastMessage':
						vscode.window.showInformationMessage(`${message.message}`);	
						break;	
					case 'unsubscribeAll':						
						for (const [key, value] of subscribeList) {
							value.cancel();
						}
						subscribeList.clear();
						break;	
					default:
					console.log('Unknown command:', message.command);
				}
			});

			panel.onDidDispose(() => {
				if (tmpDirectory && fs.existsSync(tmpDirectory)) {
					try {
						fs.rmSync(tmpDirectory, { recursive: true, force: true });
					} catch (err) {
					}
				}
			});
		
	});

	context.subscriptions.push(disposable);
}

function getEvents(orgId:string, type:string) {
    return new Promise((resolve, reject) => {
		let query = "";
		let prefix = "";
		if(type === 'platformEvents') {
			query = '<urn:queryAll><urn:queryString>SELECT Label, QualifiedApiName FROM EntityDefinition WHERE KeyPrefix LIKE \'e%\' ORDER BY Label ASC</urn:queryString></urn:queryAll>';
			prefix = '/event/';
		} else if(type === 'standardplatformEvents') {
			query = '<urn:queryAll><urn:queryString>SELECT Label, QualifiedApiName FROM EntityDefinition WHERE QualifiedApiName like \'%Event\' and (Not QualifiedApiName like \'%ChangeEvent\') ORDER BY Label ASC</urn:queryString></urn:queryAll>';
			prefix = '/event/';
		} else if(type === 'cdcEvents') {
			query = '<urn:queryAll><urn:queryString>SELECT Label, QualifiedApiName FROM EntityDefinition WHERE QualifiedApiName like \'%ChangeEvent\' ORDER BY Label ASC</urn:queryString></urn:queryAll>';
			prefix = '/data/';
		} else if(type === 'pushTopics') {
			query = '<urn:queryAll><urn:queryString>SELECT Name FROM PushTopic ORDER BY Name ASC</urn:queryString></urn:queryAll>';
			prefix = '/topic/';
		} else if(type === 'monitoringEvents') {
			prefix = '/event/';
			let pfs:any = [];	
			EVENTS_SET.monitoringEvents.forEach((evt:any) => {
				pfs.push({ name: evt, hidden: false, label: evt, url: prefix+evt});
			});	
			resolve(pfs);	
		}

		if(type !== 'monitoringEvents') {
			sendSoapAPIRequest(orgId, query)
			.then((result:any) => {
				const records = result['queryAllResponse']['result']['records'];	
				let pfs:any = [];				
				if(records) {
					let tmp = records instanceof Array ? records : [records];
					tmp.forEach((evt:any) => {
						if(evt['sf:type'] === 'PushTopic') {
							pfs.push({ name: evt['sf:Name'], hidden: false, label: evt['sf:Name'], url: prefix+evt['sf:Name']});
						} else if(type === 'standardplatformEvents') {
							if(EVENTS_SET.standardPlatformEvents.indexOf(evt['sf:QualifiedApiName']) >= 0) {
								pfs.push({ name: evt['sf:QualifiedApiName'], hidden: false, label: evt['sf:Label'], url: prefix+evt['sf:QualifiedApiName']});
							}
						} else {
							pfs.push({ name: evt['sf:QualifiedApiName'], hidden: false, label: evt['sf:Label'], url: prefix+evt['sf:QualifiedApiName']});
						}				
					});	
				}
				resolve(pfs);
			})
			.catch((error:any) => {
				reject(error);			
			});
		}
    });
}

function validateSession(orgId:string) {
	var org = orgsList.find((org:any) => org.orgId === orgId);	
	return new Promise((resolve, reject) => {
		sendSoapAPIRequest(orgId, '<urn:getUserInfo/>')
		.then((result:any) => {
			resolve({valid: true});
		}).catch((error:any) => {
			axios({method: 'POST', url: org.instanceUrl+'/services/oauth2/token?client_id=PlatformCLI&grant_type=refresh_token&refresh_token='+org.refreshToken, data: {}, 
					headers: {
						'Content-Type': 'application/x-www-form-urlencoded'
					}
				}
			).then((response:any) => {
				org.accessToken = response.data.access_token;
				return vsContext.secrets.store( `sf-access-token-${org.orgId}`, org.accessToken).then(() => {
					sendSoapAPIRequest(orgId, '<urn:getUserInfo/>')
					.then((result:any) => {
						resolve({valid: true});
					});
				});
			})
			.catch((error:any) => {
				reject(error);
			});
        });;
    });
}

function sendSoapAPIRequest(orgId:string, body:string) {
	var org = orgsList.find((org:any) => org.orgId === orgId);	
	const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: true });	
	let request =  '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:urn="urn:partner.soap.sforce.com">'+
		'<soapenv:Header><urn:SessionHeader><urn:sessionId>'+org.accessToken+'</urn:sessionId></urn:SessionHeader></soapenv:Header>'+
		'<soapenv:Body>'+body+'</soapenv:Body></soapenv:Envelope>';
	
	return new Promise((resolve, reject) => {
		axios.post(org.instanceUrl+"/services/Soap/u/"+org.apiVersion, request, { headers: {
					'Content-Type': 'text/xml; charset=utf-8',
					'SOAPAction': 'Update',
				},
			}
		).then((response:any) => {
			parser.parseString(response.data, (err:any, result:any) => {
				if (err) {
					vscode.window.showErrorMessage("Error parsing SOAP XML:", err);
					return;
				}		
				resolve(result['soapenv:Envelope']['soapenv:Body']);
			});
		})
		.catch((error:any) => {
			parser.parseString(error.response.data, (err:any, result:any) => {	
				reject(result['soapenv:Envelope']['soapenv:Body']['soapenv:Fault']['faultstring']);
			});		
		});
	});
}

function getAuthOrgs() {
    return new Promise((resolve, reject) => {
        exec('sf org list --json', (error:any, stdout:any, stderr:any) => {
            if (error) {
                reject(`Error: ${error}`);
            } else {
                try {
                    const data = JSON.parse(stdout).result;	
					const orgs = [];
					const orgIds:string[] = [];
					orgs.push(...(data.other || []), ...(data.sandboxes || []), ...(data.nonScratchOrgs || []), ...(data.devHubs || []), ...(data.scratchOrgs || []));
					const newOrgs = orgs.filter((org: any) => {
						const isConnected = org.connectedStatus === 'Connected' || org.status === 'Active';
						const isNew = !orgsList.find((o: any) => o.orgId === org.orgId);
						const isUnique = !orgIds.includes(org.orgId);
						if (isConnected && isNew && isUnique) {
							orgIds.push(org.orgId);
							return true;
						}
						return false;
					});
					if (newOrgs.length === 0) {
						resolve(orgsList); // nothing new to fetch
						return;
					}

					// Run all org display calls in parallel
					const displayPromises = newOrgs.map((org: any) => {
						return new Promise<void>((res) => {
							exec(`sf org display --target-org ${org.username} --verbose --json`, (err: any, out: any) => {
									if (err) {
										res(); // don't reject — skip this org
										return;
									}
									try {
										const display = JSON.parse(out).result;
										const sfdxAuthUrl = display.sfdxAuthUrl || '';
										const refreshToken = sfdxAuthUrl.substring(sfdxAuthUrl.indexOf('::') + 2, sfdxAuthUrl.lastIndexOf('@'));
										if (refreshToken) {
											orgsList.push({
												name: `${org.alias}(${org.username})`,
												alias: org.alias,
												orgId: org.orgId,
												instanceUrl: display.instanceUrl,
												apiVersion: display.apiVersion,
												refreshToken,
												accessToken:display.accessToken
											});
										}
									} catch (e) {
									}
									res();
								}
							);
						});
					});
					// Wait for ALL display calls to finish, then resolve
					Promise.all(displayPromises).then(() => {							
						const dir = path.dirname(orgsListPath);
						if (!fs.existsSync(dir)) {
							fs.mkdirSync(dir, { recursive: true });
						}
						Promise.all(
							orgsList.flatMap(org =>
								[
									vsContext.secrets.store( `sf-access-token-${org.orgId}`, org.accessToken),
									vsContext.secrets.store( `sf-refresh-token-${org.orgId}`, org.refreshToken)
								]
							)
						).then(() => {
							const sanitizedOrgs = orgsList.map(org => ({
								name: org.name,
								alias: org.alias,
								orgId: org.orgId,
								instanceUrl: org.instanceUrl,
								apiVersion: org.apiVersion,
							}));
							fs.writeFile(orgsListPath, JSON.stringify(sanitizedOrgs, null, 2), 'utf8', (err:any) => {}); 	
							resolve(orgsList);
						});	
					});
                } catch (parseError:any) {
                    reject(`Parse Error: ${parseError.message}`);
                }
            }
        });
    });
}

function getWebviewContent(basedpath:string, scriptUri:vscode.Uri, cssUri:vscode.Uri) {

	return `<!doctype html>
			<html lang="en">
			<head>
				<meta charset="UTF-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1.0" />
				<title>Salesforce Events Monitor</title>
				<script src="https://code.jquery.com/jquery-3.7.1.min.js"></script>
				<script src="https://code.jquery.com/ui/1.14.1/jquery-ui.min.js"></script>
				<script src="https://cdn.datatables.net/2.1.8/js/dataTables.min.js"></script>				
				<link rel="stylesheet" href="https://cdn.datatables.net/2.1.8/css/dataTables.dataTables.min.css">
				<script src="https://cdn.datatables.net/select/2.1.0/js/dataTables.select.min.js"></script>				
				<link rel="stylesheet" href="https://cdn.datatables.net/select/2.1.0/css/select.dataTables.min.css">
				<link rel="stylesheet" href="https://code.jquery.com/ui/1.14.1/themes/base/jquery-ui.css">
			</head>
			<body>	
				<div style="margin: 20px;">
					<div style="display:flex;justify-content: space-between;align-items: center;">	
						<h1>Salesforce Events Monitor</h1>		
						<a href="https://github.com/rjallu9/salesforce-event-monitor/issues" title="Report issue" style="height"25px;">
							<svg width="25px" height="25px" viewBox="0 0 36 36" version="1.1"  preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
								<circle cx="18" cy="18" r="14" fill="#0078d4"/>
								<text x="18" y="20" font-family="Arial" font-size="20" text-anchor="middle" alignment-baseline="middle" fill="white">?</text>
							</svg>
						</a>		
					</div>
					<div style="display:flex;">			
						<div id="org" style="margin-right:5px;display:none;">	
							<label for="text" for="org-field" class="top-label">Org:</label>
							<select type="text" class="org-field" id="org-field" style="height:36px;">
							</select>		
						</div>
						<div>
							<p id="org-refresh" style="margin-bottom:0;margin-top:25px;margin-right:5px;cursor:pointer;display:none;" title="Refresh Orgs">
								<svg width="25" height="25" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
									<circle cx="512" cy="512" r="512" fill="#0078d4"></circle>
									<path d="M512 281.6c71.221 0 136.396 32.619 179.2 85.526V256h51.2v204.8H537.6v-51.2h121.511c-32.857-47.165-87.235-76.8-147.111-76.8-98.97 0-179.2 80.23-179.2 179.2 0 98.97 80.23 179.2 179.2 179.2v-.02c73.665 0 138.994-44.857 166.176-111.988l47.458 19.216C690.689 684.711 606.7 742.38 512 742.38v.02c-127.246 0-230.4-103.154-230.4-230.4 0-127.246 103.154-230.4 230.4-230.4z" fill="white" fill-rule="nonzero"></path>
								</svg>
							</p>
						</div>
					</div>
					<div id="tabs" style="margin-top:10px;">
						<ul>
							<li class="tab" name="messagesList"><a href="#messagesTab">Subscribe</a></li>
							<li class="tab" name="publishList"><a href="#publishTab">Publish</a></li>
						</ul>
						<div id="messagesTab">		
							<div style="display:flex;">				
								<div id="eventTypesDD">	
									<label for="text" for="eventTypes" class="top-label">Types:</label>
									<select type="text" class="eventTypes" id="eventTypes" style="height:36px;">
										<option value=""></option>
										<option value="platformEvents">Platform Events (Custom)</option>
										<option value="standardplatformEvents">Platform Events (Standard)</option>
										<option value="cdcEvents">Change Data Captures</option>
										<option value="pushTopics">Push Topics</option>
										<option value="monitoringEvents">Monitoring Events</option>
										<option value="custom">Custom Channel</option>
									</select>		
								</div>								
								<div id="customChannelDD" style="margin-left:15px;display:none;">
									<label for="text" for="customChannelUrl" class="top-label">Subscription Channel:</label>
									<input type="text" class="customChannelUrl" id="customChannelUrl" style="height:32px;width:300px;border:1px solid rgb(118, 118, 118);"></input>	
								</div>	
								<div id="eventsDD" style="margin-left:15px;">
									<div>	
										<label for="text" for="dd-text-field" class="top-label">Events: </label>
										<input type="text" class="dd-text-field" id="dd-text-field"></input>								
										<span style="margin-left: -19px;color: #888;">
											<svg width="15" height="15" viewBox="0 0 24 12" fill="#cccccc;" xmlns="http://www.w3.org/2000/svg" style="color: #cccccc;">
												<path d="M6 9l6 6 6-6" stroke="#cccccc" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></path>
											</svg>
										</span>
									</div>
									<div class="dd-option-box">
										<div style="padding:5px 10px 5px 10px;" id="select-all-div">
											<input type="checkbox" value="All" class="dd-select-all">
											<label for="select-all">All</label>
										</div>
										<div class="dd-options">
											<ui style="list-style-type: none;">                       
											</ui>
										</div>
									</div>
								</div>
								<div id="replayDD" style="display:flex;margin-left:15px;">	
									<div>
										<label for="text" for="replayOptions" class="top-label">Replay Options:</label>
										<select type="text" class="replayOptions" id="replayOptions" style="height:36px;" disabled>
											<option value=""></option>
											<option value="-1">New Events</option>
											<option value="-2">Stored Events</option>
											<option value="0" id="customReplayId">Custom Replay</option>
										</select>
									</div>	
									<div id="replayIdDD" style="margin-left:15px;display:none;">
										<label for="text" for="replayId" class="top-label">Replay Id:</label>
										<input type="text" class="replayId" id="replayId" style="height:32px;border:1px solid rgb(118, 118, 118);"></input>	
									</div>		
								</div>
								<button type="button" style="height:36px; margin:22px 0 0 15px;" id="subscribeBtn" disabled>Subscribe</button>
								<button type="button" style="height:36px; margin:22px 0 0 15px;" id="viewSubEventsBtn" disabled>Subscribed Events</button>
							</div>
							<table id="messagesList" class="display" style="width:100%">
								<thead>
									<tr>	
										<th>Event Name</th>
										<th>Replay Id</th>
										<th>Created Date</th>
										<th>Payload</th>
										<th>JSON(Formatted)</th>										
									</tr>
								</thead>
							</table>
							<div>
								<button type="button" style="width: 75px;" id="export" disabled>Export</button>
								<button type="button" style="width: 75px;" id="clear" disabled>Clear</button>
							</div>
						</div>
						<div id="publishTab">
							<div style="display:flex;">				
								<div id="publishEventTypesDD">	
									<label for="text" for="publishEventTypes" class="top-label">Types:</label>
									<select type="text" class="eventTypes" id="publishEventTypes" style="height:36px;">
										<option value=""></option>
										<option value="platformEvents">Platform Events (Custom)</option>
									</select>		
								</div>
								<div id="publishEventsDD" style="margin-left:15px;">
									<label for="text" for="publishEvents" class="top-label">Events:</label>
									<select type="text" class="eventTypes" id="publishEvents" style="height:36px;width:300px;">
									</select>	
								</div>
							</div>
							<div style="text-align:right;" id="publishPayload">
								<textarea id="payload" style="width:100%;height:150px;margin-top:10px;font-size:14px;" placeholder="Enter payload in JSON format" disabled></textarea>
								<div style="display:flex">
									<p style="color:red;display:none;" id="payloaderror">*** Invalid JSON payload.</p>
									<button type="button" style="width: 100px;margin-top:10px;margin-left:auto;" id="publishBtn" disabled>Publish</button>
								</div>
							</div>
							<table id="publishList" class="display" style="width:100%">
								<thead>
									<tr>	
										<th>Event Name</th>
										<th>Event Id</th>
										<th>Payload</th>	
										<th>JSON(Formatted)</th>								
									</tr>
								</thead>
							</table>
						</div>
					</div>
				</div>
				<div id="spinner" class="spinner">
					<div class="cv-spinner">
						<span class="spinner-circle"></span>
						<p style="margin-left: 5px;" class="spinnerlabel">Initializing</p>
					</div>
				</div>
				<div id="event-lists-dialog" title="Subscribed Events">
					<table id="subeventList" class="display" style="width:100%">
						<thead>
							<tr>	
								<th>Event Name</th>
								<th>Action</th>									
							</tr>
						</thead>
					</table>					
					<div style="text-align:right;margin-top:10px;">
						<button type="button" style="width:110px;" id="unsubscribeAllBtn" disabled>Unsubscribe All</button>
					</div>
				</div>
				<div id="payload-dialog" title="Payload">
					<textarea id="payloadview" style="width:716px;height:490px;font-size:14px;" readonly></textarea>
				</div>
			</body>
			<script src=${scriptUri}></script>
			<link rel="stylesheet" href=${cssUri}>
			</html>`;
}

export function deactivate() {
	if (tmpDirectory && fs.existsSync(tmpDirectory)) {
        try {
            fs.rmSync(tmpDirectory, { recursive: true, force: true });
        } catch (err) {
        }
    }

	try {
		fs.readdir(fsPath, (err:any, files:any[]) => {
			files.filter(file => file.endsWith('.json') && file !== 'orgsListV3.json')
				.forEach(file => {
					const filePath = path.join(fsPath, file);
					fs.rmSync(filePath);
				});
		});
	} catch (err) {
	}
}

