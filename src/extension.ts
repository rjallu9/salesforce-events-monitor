import * as vscode from 'vscode';
const path = require('path');
const axios = require('axios');
const xml2js = require('xml2js');
const { exec } = require('child_process');
const fs = require('fs');
const jsforce = require('jsforce');

let tmpDirectory = '';

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

			let orgsList: any[] = [];

			tmpDirectory = context.globalStorageUri.fsPath+"/tmp";

			panel.webview.onDidReceiveMessage((message) => {
				switch (message.command) {
					case 'getAuthOrgs':			
						var orgsListPath = path.join(context.globalStorageUri.fsPath, 'orgsList.json');
						if (fs.existsSync(orgsListPath) && !message.refresh) {
							orgsList = JSON.parse(fs.readFileSync(orgsListPath, 'utf-8'));
							panel.webview.postMessage({ command: 'orgsList', orgs: orgsList});
						} else {
							getAuthOrgs().then((result:any) => {
								orgsList = result;	
								panel.webview.postMessage({command: 'orgsList', orgs: result});	
								const dir = path.dirname(context.globalStorageUri.fsPath);
								if (!fs.existsSync(dir)) {
									fs.mkdirSync(dir, { recursive: true });
								}	
								fs.writeFile(context.globalStorageUri.fsPath+"/orgsList.json", JSON.stringify(orgsList, null, 2), 'utf8', (err:any) => {
								}); 			
							});	
						}				
						break;
					case 'subscribe':			
						var org = orgsList.find((org:any) => org.orgId === message.orgId);	
						const conn = new jsforce.Connection({
							instanceUrl : org.instanceUrl,
							accessToken : org.accessToken
						});
						conn.streaming.topic("/event/Data_Sync__e").subscribe((message:any) => {
							panel.webview.postMessage({ command: 'message', message: message, name:'Data_Sync__e'});				
						});			
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

function validateSession(accessToken:string, endPoint:string, orgId:string) {
	return new Promise((resolve, reject) => {
		sendSoapAPIRequest(accessToken, endPoint, '<urn:getUserInfo/>')
		.then((result:any) => {
			resolve({valid: true});
		}).catch((error:any) => {
			if(error.indexOf('INVALID_SESSION_ID') >= 0) {
				let attempts = 0;
				function retry() {
					attempts++;
					getAuthOrgs().then((orgsList:any) => {
						let org = orgsList.find((org:any) => org.orgId === orgId);
						return sendSoapAPIRequest(org.accessToken, org.instanceUrl, '<urn:getUserInfo/>')
							.then((res) => {
								resolve({ valid: true, orgsList });
							})
							.catch((err) => {
								if (attempts < 5) {
									retry();
								} else {
									reject(new Error('Max retries reached. Session validation failed.'));
								}
							}
						);
					});					  
				}
				retry();
			}
        });;
    });
}

function sendSoapMDRequest(accessToken:string,  endPoint:string, body:string) {
	const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: true });	
	let reuest =  '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:met="http://soap.sforce.com/2006/04/metadata">'+
		'<soapenv:Header><met:SessionHeader><met:sessionId>'+accessToken+'</met:sessionId></met:SessionHeader></soapenv:Header>'+
		'<soapenv:Body>'+body+'</soapenv:Body></soapenv:Envelope>';
	
	return new Promise((resolve, reject) => {
		axios.post(endPoint+"/services/Soap/m/62.0", reuest, { headers: {
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

function sendSoapAPIRequest(accessToken:string,  endPoint:string, body:string) {
	const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: true });	
	let request =  '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:urn="urn:partner.soap.sforce.com">'+
		'<soapenv:Header><urn:SessionHeader><urn:sessionId>'+accessToken+'</urn:sessionId></urn:SessionHeader></soapenv:Header>'+
		'<soapenv:Body>'+body+'</soapenv:Body></soapenv:Envelope>';
	
	return new Promise((resolve, reject) => {
		axios.post(endPoint+"/services/Soap/u/62.0", request, { headers: {
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
					const orgList:Object[] = [];
					const orgs = [];
					const orgIds:string[] = [];
					orgs.push(...data.other, ...data.sandboxes, ...data.nonScratchOrgs, ...data.devHubs, ...data.scratchOrgs);
					orgs.forEach((org:any) => {
						if((org.connectedStatus === 'Connected' || org.status === 'Active') && orgIds.indexOf(org['orgId']) < 0) {
							orgList.push({
								name: org['alias']+'('+org['username']+')',
								alias: org['alias'],
								orgId: org['orgId'],
								accessToken: org['accessToken'],
								instanceUrl: org['instanceUrl']
							});
							orgIds.push(org['orgId']);
						}						
					});
                    resolve(orgList);
                } catch (parseError:any) {
                    reject(`Parse Error: ${parseError.message}`);
                }
            }
        });
    });
}

function refreshOrgs() {
    return new Promise((resolve, reject) => {
        const orgsDir = path.join(process.env.HOME || process.env.USERPROFILE || '', '.sfdx');    
		const alias = JSON.parse(fs.readFileSync(orgsDir+'/alias.json', 'utf-8'));
		console.log(alias.orgs);
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
						<a href="https://github.com/rjallu9/salesforce-deployment-suite/issues" title="Report issue" style="height"25px;">
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
						<div>
							<button type="button" style="width: 75px;float:right;" id="subscribe">Subscribe</button>
						</div>
					</div>
					<div id="selectiontabs" style="margin-top:10px;">
						<ul>
							<li class="tab" name="eventstable"><a href="#eventstable" class="available">Available (0)</a></li>
							<li class="tab" name="selecteddatatable"><a href="#selected" class="selected">Selected (0)</a></li>
						</ul>
						<div id="available">
							<table id="eventsList" class="display" style="width:100%">
								<thead>
									<tr>	
										<th>Event Name</th>
										<th>Replay Id</th>
										<th>Payload</th>										
									</tr>
								</thead>
							</table>
							<div>
								<button type="button" style="width: 75px;" id="export" disabled>Export</button>
							</div>
						</div>
					</div>
				</div>
				<div id="spinner" class="spinner">
					<div class="cv-spinner">
						<span class="spinner-circle"></span>
						<p style="margin-left: 5px;" class="spinnerlabel">Initializing</p>
					</div>
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
}

