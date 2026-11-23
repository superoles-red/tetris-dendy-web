// Text drawn by the web controls. The game canvas and title use the selected cartridge.
export const translations = {
  en: {
    pageTitle: 'Tetris · Tengen', titleArt: 'Tengen presents Tetris',
    play: 'PLAY', setup: 'NEW GAME', start: 'START', back: 'BACK',
    pause: 'PAUSE', resume: 'RESUME', sound: 'SOUND', restart: 'RESTART',
    mainMenu: 'MAIN MENU', playAgain: 'PLAY AGAIN', initials: 'INITIALS',
    support: 'SUPPORT', supportHint: 'Support link coming later',
    level: 'LEVEL', rows: 'GARBAGE ROWS', music: 'MUSIC', effects: 'SOUND FX', track: 'TRACK',
    language: 'LANGUAGE', off: 'OFF', tracks: ['SILENCE', 'LOGINSKA', 'BRADINSKY', 'KARINKA', 'TROIKA'],
    previous: 'Previous', next: 'Next', game: 'Game', gameMenu: 'Game menu',
    field: 'Tetris playfield and statistics', controls: 'Game controls',
    enterInitials: 'Enter your initials', previousLetter: 'Previous letter', nextLetter: 'Next letter',
    confirmLetter: 'Confirm letter', left: 'Move left', right: 'Move right', down: 'Soft drop',
    a: 'Rotate clockwise', b: 'Rotate counterclockwise', starting: 'STARTING…',
    error: 'The game could not start. Reload the page to try again.'
  },
  ru: {
    pageTitle: 'Тетрис · Тенген', titleArt: 'Тенген представляет Тетрис',
    play: 'ИГРАТЬ', setup: 'НОВАЯ ИГРА', start: 'СТАРТ', back: 'НАЗАД',
    pause: 'ПАУЗА', resume: 'ПРОДОЛЖИТЬ', sound: 'ЗВУК', restart: 'ЗАНОВО',
    mainMenu: 'ГЛАВНОЕ МЕНЮ', playAgain: 'ИГРАТЬ СНОВА', initials: 'ИНИЦИАЛЫ',
    support: 'ПОДДЕРЖАТЬ', supportHint: 'Ссылку для поддержки добавим позже',
    level: 'УРОВЕНЬ', rows: 'РЯДЫ НА СТАРТЕ', music: 'МУЗЫКА', effects: 'ЭФФЕКТЫ', track: 'МЕЛОДИЯ',
    language: 'ЯЗЫК', off: 'ВЫКЛ', tracks: ['БЕЗ МУЗЫКИ', 'ЛОГИНСКА', 'БРАДИНСКИЙ', 'КАЛИНКА', 'ТРОЙКА'],
    previous: 'Назад', next: 'Вперёд', game: 'Игра', gameMenu: 'Игровое меню',
    field: 'Игровое поле Тетриса и статистика', controls: 'Управление',
    enterInitials: 'Введите инициалы', previousLetter: 'Предыдущая буква', nextLetter: 'Следующая буква',
    confirmLetter: 'Подтвердить букву', left: 'Влево', right: 'Вправо', down: 'Ускорить падение',
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
