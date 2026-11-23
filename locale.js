// Text drawn by the web controls. The game canvas and title use the selected cartridge.
export const translations = {
  en: {
    pageTitle: 'Tetris · Tengen', titleArt: 'Tengen presents Tetris',
    play: 'PLAY', continueRun: 'CONTINUE', resumePrompt: 'CONTINUE GAME?', replacePrompt: 'START A NEW GAME?',
    replaceNote: 'Starting a new game will replace this saved game.', yes: 'YES', no: 'NO', setup: 'NEW GAME', start: 'START', back: 'BACK',
    newRecord: 'NEW RECORD', saveRecord: 'SAVE RECORD', saveRecordPrompt: 'SAVE RECORD?',
    showResults: 'VIEW RECORDS',
    records: 'RECORDS', emptyRecords: 'NO RECORDS YET', recordName: 'NAME', recordScore: 'SCORE', recordLines: 'LINES',
    pause: 'PAUSE', resume: 'RESUME', sound: 'SOUND', restart: 'RESTART',
    mainMenu: 'MAIN MENU', playAgain: 'PLAY AGAIN',
    support: 'SUPPORT', supportHint: 'Support link coming later',
    level: 'LEVEL', rows: 'GARBAGE ROWS', music: 'MUSIC', effects: 'SOUND FX', track: 'TRACK',
    language: 'LANGUAGE', off: 'OFF', shuffle: 'SHUFFLE', tracks: ['SILENCE', 'LOGINSKA', 'BRADINSKY', 'KARINKA', 'TROIKA'],
    previous: 'Previous', next: 'Next', game: 'Game', gameMenu: 'Game menu',
    field: 'Tetris playfield and statistics', controls: 'Game controls',
    left: 'Move left', right: 'Move right', down: 'Soft drop',
    a: 'Rotate clockwise', b: 'Rotate counterclockwise', starting: 'STARTING…',
    error: 'The game could not start. Reload the page to try again.'
  },
  ru: {
    pageTitle: 'Тетрис · Тенген', titleArt: 'Тенген представляет Тетрис',
    play: 'ИГРАТЬ', continueRun: 'ПРОДОЛЖИТЬ', resumePrompt: 'ПРОДОЛЖИТЬ ИГРУ?', replacePrompt: 'НАЧАТЬ НОВУЮ ИГРУ?',
    replaceNote: 'Когда вы начнёте новую игру, она заменит эту сохранённую партию.', yes: 'ДА', no: 'НЕТ', setup: 'НОВАЯ ИГРА', start: 'СТАРТ', back: 'НАЗАД',
    newRecord: 'НОВЫЙ РЕКОРД', saveRecord: 'ЗАПИСАТЬ РЕКОРД', saveRecordPrompt: 'ЗАПИСАТЬ РЕКОРД?',
    showResults: 'К РЕКОРДАМ',
    records: 'РЕКОРДЫ', emptyRecords: 'ПОКА НЕТ РЕКОРДОВ', recordName: 'ИМЯ', recordScore: 'СЧЁТ', recordLines: 'ЛИНИИ',
    pause: 'ПАУЗА', resume: 'ПРОДОЛЖИТЬ', sound: 'ЗВУК', restart: 'ЗАНОВО',
    mainMenu: 'ГЛАВНОЕ МЕНЮ', playAgain: 'ИГРАТЬ СНОВА',
    support: 'ПОДДЕРЖАТЬ', supportHint: 'Ссылку для поддержки добавим позже',
    level: 'УРОВЕНЬ', rows: 'РЯДЫ НА СТАРТЕ', music: 'МУЗЫКА', effects: 'ЭФФЕКТЫ', track: 'МЕЛОДИЯ',
    language: 'ЯЗЫК', off: 'ВЫКЛ', shuffle: 'СЛУЧАЙНО', tracks: ['БЕЗ МУЗЫКИ', 'ЛОГИНСКА', 'БРАДИНСКИЙ', 'КАЛИНКА', 'ТРОЙКА'],
    previous: 'Назад', next: 'Вперёд', game: 'Игра', gameMenu: 'Игровое меню',
    field: 'Игровое поле Тетриса и статистика', controls: 'Управление',
    left: 'Влево', right: 'Вправо', down: 'Ускорить падение',
    a: 'Повернуть по часовой', b: 'Повернуть против часовой', starting: 'ЗАПУСК…',
    error: 'Не удалось запустить игру. Обновите страницу и попробуйте ещё раз.'
  }
};

export function preferredLanguage() {
  for (const tag of navigator.languages || [navigator.language]) {
    const language = tag.split('-')[0].toLowerCase();
    if (language === 'ru' || language === 'en') return language;
  }
  return 'en';
}
