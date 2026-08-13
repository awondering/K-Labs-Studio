function setOfflineStatusLabel(label){
	const el=document.getElementById('offlineReadyStatus');
	if(!el)return;
	el.textContent=label;
	const settingsEl=document.getElementById('settingsOfflineStatus');
	if(settingsEl){
		settingsEl.textContent=label;
	}
}

function isLocalDevelopment(){
	return location.protocol==='file:' || location.hostname==='localhost' || location.hostname==='127.0.0.1' || location.hostname==='0.0.0.0';
}

function clearLocalServiceWorkerState(){
	if(!('caches' in window))return Promise.resolve();
	return caches.keys().then((keys)=>Promise.all(keys.map((key)=>caches.delete(key))));
}

function forceLocalDevReload(){
	const reloadKey='klabs-local-dev-reload-done';
	try{
		if(sessionStorage.getItem(reloadKey)==='true')return Promise.resolve(false);
		sessionStorage.setItem(reloadKey,'true');
	}catch{
		return Promise.resolve(false);
	}
	const baseUrl=location.href.split('?')[0];
	const reloadUrl=baseUrl+'?klabsDevReload='+Date.now();
	location.replace(reloadUrl);
	return Promise.resolve(true);
}

function promptServiceWorkerUpdate(registration){
	if(!registration || !registration.waiting)return;
	registration.waiting.postMessage({type:'SKIP_WAITING'});
}

function wireServiceWorkerUpdateFlow(registration){
	if(!registration)return;
	const handleWorkerState=()=>{
		const installing=registration.installing;
		if(!installing)return;
		installing.addEventListener('statechange',()=>{
			if(installing.state!=='installed')return;
			if(navigator.serviceWorker.controller){
				promptServiceWorkerUpdate(registration);
			}
		});
	};
	handleWorkerState();
	registration.addEventListener('updatefound',handleWorkerState);
	if(registration.waiting){
		promptServiceWorkerUpdate(registration);
	}
}

function reloadOnceForNewController(){
	const reloadKey='klabs-sw-controller-reload';
	try{
		if(sessionStorage.getItem(reloadKey)==='1')return;
		sessionStorage.setItem(reloadKey,'1');
	}catch{}
	location.reload();
}

function scheduleServiceWorkerUpdateChecks(registration){
	if(!registration || typeof registration.update!=='function')return;
	const runCheck=()=>registration.update().catch(()=>{});
	runCheck();
	document.addEventListener('visibilitychange',()=>{
		if(document.visibilityState==='visible')runCheck();
	});
	window.addEventListener('focus',runCheck);
}

if('serviceWorker' in navigator){
	window.addEventListener('load',()=>{
		const hadControllerBeforeRegistration=!!navigator.serviceWorker.controller;
		if(isLocalDevelopment()){
			navigator.serviceWorker.getRegistrations().then((registrations)=>Promise.all(registrations.map((registration)=>registration.unregister()))).catch(()=>{}).then(()=>clearLocalServiceWorkerState()).then(()=>{
				return forceLocalDevReload();
			}).then((reloaded)=>{
				if(!reloaded){setOfflineStatusLabel('READY OFFLINE');}
			});
			return;
		}
		navigator.serviceWorker.register('./service-worker.js',{updateViaCache:'none'}).then((registration)=>{
			wireServiceWorkerUpdateFlow(registration);
			scheduleServiceWorkerUpdateChecks(registration);
			return navigator.serviceWorker.ready;
		}).then(()=>{
			setOfflineStatusLabel('OFFLINE READY');
		}).catch(()=>{
			setOfflineStatusLabel('READY OFFLINE');
		});
	});

	navigator.serviceWorker.addEventListener('controllerchange',()=>{
		setOfflineStatusLabel('OFFLINE READY');
			if(hadControllerBeforeRegistration){
				reloadOnceForNewController();
			}
	});
}

KLABS_UI.buildWheels();
KLABS_UI.renderBlanks();
KLABS_UI.render();
