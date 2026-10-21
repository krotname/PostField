export const BROWSERS = ['chrome', 'opera', 'edge', 'firefox'];
export function manifestFor(browser, version) {
  if (!BROWSERS.includes(browser) || !/^\d+\.\d+\.\d+$/u.test(version)) throw new Error('invalid_build_target_or_version');
  return {
    manifest_version: 3, name: 'PostField — почтовый индекс', version,
    description: 'Находит индекс по адресу в РФ. Photon без ключа, Geoapify или DaData. Авто и ручной режимы.',
    author: 'Kreout',
    permissions: ['activeTab', 'scripting', 'storage'], host_permissions: ['https://*/*', 'http://*/*'],
    icons: { 16: 'icons/16.png', 32: 'icons/32.png', 48: 'icons/48.png', 96: 'icons/96.png', 128: 'icons/128.png' },
    action: { default_popup: 'popup.html', default_title: 'PostField — почтовый индекс', default_icon: { 16: 'icons/16.png', 32: 'icons/32.png' } },
    options_ui: { page: 'options.html', open_in_tab: true },
    content_security_policy: { extension_pages: "script-src 'self'; object-src 'none'; connect-src https://api.geoapify.com https://photon.komoot.io https://cleaner.dadata.ru" },
    ...(browser === 'firefox' ? {
      background: { scripts: ['background.js'] },
      browser_specific_settings: { gecko: { id: 'postfield@krot.name', strict_min_version: '142.0',
        data_collection_permissions: { required: ['personallyIdentifyingInfo', 'authenticationInfo'] } } },
    } : { minimum_chrome_version: '120', background: { service_worker: 'background.js' } }),
  };
}
