import { migrateSettings } from '../../../packages/shared/src';
/** Readers never rewrite the settings object: Chrome storage has no compare-and-set. */
export async function loadSettings() {
    let stored=await chrome.storage.local.get(['settings','settingsMigration']);
    if(stored.settings && stored.settings.settingsVersion===undefined && stored.settingsMigration?.version!==2){
        // A separate, idempotent marker cannot overwrite a concurrently saved URL,
        // token or manual color. Saving in the panel persists the versioned object.
        await chrome.storage.local.set({settingsMigration:{version:2,legacyWhiteDefault:stored.settings.playingColor==='white'}});
        stored=await chrome.storage.local.get('settings');
    }
    return migrateSettings(stored.settings);
}
