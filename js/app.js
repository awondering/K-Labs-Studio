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

if('serviceWorker' in navigator){
	window.addEventListener('load',()=>{
		if(isLocalDevelopment()){
			navigator.serviceWorker.getRegistrations().then((registrations)=>Promise.all(registrations.map((registration)=>registration.unregister()))).catch(()=>{}).then(()=>clearLocalServiceWorkerState()).then(()=>{
				return forceLocalDevReload();
			}).then((reloaded)=>{
				if(!reloaded){setOfflineStatusLabel('READY OFFLINE');}
			});
			return;
		}
		navigator.serviceWorker.register('./service-worker.js').then(()=>{
			return navigator.serviceWorker.ready;
		}).then(()=>{
			setOfflineStatusLabel('OFFLINE READY');
		}).catch(()=>{
			setOfflineStatusLabel('READY OFFLINE');
		});
	});

	navigator.serviceWorker.addEventListener('controllerchange',()=>{
		setOfflineStatusLabel('OFFLINE READY');
	});
}

KLABS_UI.buildWheels();
KLABS_UI.renderBlanks();
KLABS_UI.render();
