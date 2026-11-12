// UI strings. Elements carry data-i18n="key" (text) or data-i18n-html="key" (markup); code uses t(key, params).
const STR = {
  ru: {
    subtitle: 'G106: прошивка через загрузчик по USB-UART',
    noSerial: 'Нет Web Serial. Нужен Chrome, Edge или Opera на компьютере.',
    insecure: 'Web Serial работает только на https:// или http://localhost.',
    fwTitle: '1. Прошивка',
    srcReleases: 'Релизы g106-open',
    srcFile: 'Свой файл',
    loadingReleases: 'Загрузка списка релизов…',
    noReleases: 'Список релизов недоступен.',
    latest: 'последний',
    prerelease: 'пре-релиз',
    releaseNotes: 'Описание релиза',
    drop: 'Файл .xgf, .zip или .bin',
    port: '2. Порт',
    choosePort: 'Выбрать порт USB-UART',
    closePort: 'Закрыть порт',
    noPort: 'Порт не выбран.',
    portInfo: 'Порт открыт: {dev}, 115200 8N1',
    flashTitle: '3. Прошить',
    flash: 'Прошить',
    cancel: 'Отмена',
    howto: `<ol>
<li>Выберите прошивку и порт.</li>
<li>Нажмите <b>Прошить</b> и включите трансивер, удерживая ручку громкости.</li>
<li>После <code>Complete!</code> выключите и включите трансивер.</li>
</ol>`,
    bootOut: 'Вывод загрузчика',
    log: 'Журнал',
    notesTitle: 'Примечания',
    notes: `<ul>
<li>Пишется только приложение с <code>0x08020000</code>, загрузчик не трогается. Настройки сохраняются.</li>
<li>Заводская прошивка: выберите её .xgf или архив .zip.</li>
<li>USART1: PA9 TX, PA10 RX, 3,3 В.</li>
</ul>`,
    // dynamic
    fileLoaded: '{name}: {size} байт, SHA-256 {sha}',
    downloading: 'Загрузка {name}…',
    kind_open: 'g106-open',
    kind_stock: 'Заводская прошивка {label}',
    kind_other: 'Неизвестная прошивка G106 (таблица векторов корректна)',
    built: 'собрана {date}',
    rawEncrypted: 'Сырой образ — зашифрован в .xgf здесь же.',
    fromZip: 'Из архива: {name}',
    zipMany: 'В архиве несколько .xgf, взят {name}.',
    vec: 'Размер {size} байт, вектор сброса 0x{reset}, стек 0x{sp}.',
    err_empty: 'файл пустой',
    err_tooBig: 'файл больше области приложения (896 КБ)',
    err_notXgf: 'это не прошивка G106: после расшифровки нет корректной таблицы векторов (повреждён или чужой файл)',
    err_noXgfInZip: 'в архиве нет файлов .xgf',
    err_sha: 'контрольная сумма не совпала — файл повреждён при загрузке',
    badFile: 'Файл не подходит: {why}',
    st_wait: 'Ожидание загрузчика: включите трансивер, удерживая ручку громкости…',
    st_erasing: 'Загрузчик стирает область приложения…',
    st_sending: 'Отправка прошивки…',
    st_finishing: 'Завершение…',
    done: 'Готово! Выключите трансивер и включите обычным образом.',
    doneNoComplete: 'Передача прошла, но загрузчик не написал «Complete!». Посмотрите на экран трансивера; при сомнениях прошейте ещё раз.',
    aborted: 'Отменено. Прошивка не завершена — запустите её заново (меню загрузчика доступно всегда).',
    err_timeoutMenu: 'меню загрузчика не появилось за 5 минут, ничего не отправлено',
    err_canceled: 'загрузчик отменил передачу',
    err_noEotAck: 'загрузчик не подтвердил конец передачи',
    err_block: 'блок {n} не принят после 10 попыток',
    portBusy: 'Не удалось открыть порт: он занят другой программой или нет прав доступа ({msg})',
    portLost: 'Порт пропал (адаптер отключён?)',
    error: 'Ошибка: {msg}',
  },
  en: {
    subtitle: 'G106: flashing via the bootloader over USB-UART',
    noSerial: 'No Web Serial. Use Chrome, Edge or Opera on a computer.',
    insecure: 'Web Serial only works on https:// or http://localhost.',
    fwTitle: '1. Firmware',
    srcReleases: 'g106-open releases',
    srcFile: 'Own file',
    loadingReleases: 'Loading the release list…',
    noReleases: 'Release list unavailable.',
    latest: 'latest',
    prerelease: 'pre-release',
    releaseNotes: 'Release notes',
    drop: '.xgf, .zip or .bin file',
    port: '2. Port',
    choosePort: 'Select USB-UART port',
    closePort: 'Close port',
    noPort: 'No port selected.',
    portInfo: 'Port open: {dev}, 115200 8N1',
    flashTitle: '3. Flash',
    flash: 'Flash',
    cancel: 'Cancel',
    howto: `<ol>
<li>Choose the firmware and the port.</li>
<li>Press <b>Flash</b> and switch the radio on holding the volume knob.</li>
<li>After <code>Complete!</code> switch the radio off and on.</li>
</ol>`,
    bootOut: 'Bootloader output',
    log: 'Log',
    notesTitle: 'Notes',
    notes: `<ul>
<li>Only the application from <code>0x08020000</code> is written, the bootloader is kept. Settings are kept.</li>
<li>Stock firmware: choose its .xgf or .zip archive.</li>
<li>USART1: PA9 TX, PA10 RX, 3.3 V.</li>
</ul>`,
    fileLoaded: '{name}: {size} bytes, SHA-256 {sha}',
    downloading: 'Downloading {name}…',
    kind_open: 'g106-open',
    kind_stock: 'Stock firmware {label}',
    kind_other: 'Unknown G106 firmware (vector table is valid)',
    built: 'built {date}',
    rawEncrypted: 'Raw image — encrypted to .xgf right here.',
    fromZip: 'From the archive: {name}',
    zipMany: 'Several .xgf in the archive, using {name}.',
    vec: 'Size {size} bytes, reset vector 0x{reset}, stack 0x{sp}.',
    err_empty: 'the file is empty',
    err_tooBig: 'the file is larger than the application area (896 KB)',
    err_notXgf: 'not G106 firmware: no valid vector table after decryption (damaged or foreign file)',
    err_noXgfInZip: 'no .xgf files in the archive',
    err_sha: 'checksum mismatch — the download is damaged',
    badFile: 'Unusable file: {why}',
    st_wait: 'Waiting for the bootloader menu: switch the radio on holding the volume knob…',
    st_erasing: 'The bootloader is erasing the application area…',
    st_sending: 'Sending the firmware…',
    st_finishing: 'Finishing…',
    done: 'Done! Switch the radio off and on normally.',
    doneNoComplete: 'Transfer finished but the bootloader did not print "Complete!". Look at the radio\'s screen; if in doubt, flash again.',
    aborted: 'Cancelled. Flashing is incomplete — start it again (the bootloader menu is always available).',
    err_timeoutMenu: 'no bootloader menu within 5 minutes, nothing was sent',
    err_canceled: 'the bootloader cancelled the transfer',
    err_noEotAck: 'the bootloader did not acknowledge the end of transfer',
    err_block: 'block {n} not accepted after 10 attempts',
    portBusy: 'Cannot open the port: another program holds it or no access rights ({msg})',
    portLost: 'The port is gone (adapter unplugged?)',
    error: 'Error: {msg}',
  },
};

let lang = localStorage.getItem('g106flash.lang') || (navigator.language.startsWith('ru') ? 'ru' : 'en');

export function t(key, p = {}) {
  const s = STR[lang][key] ?? STR.en[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (_, k) => p[k] ?? '');
}

export const has = key => key in STR.en;
export const getLang = () => lang;

export function setLang(l) {
  lang = l;
  localStorage.setItem('g106flash.lang', l);
  document.documentElement.lang = l;
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of document.querySelectorAll('[data-i18n-html]')) el.innerHTML = t(el.dataset.i18nHtml);
  for (const b of document.querySelectorAll('#lang button')) b.classList.toggle('on', b.dataset.lang === l);
}
