// 浏览器通知：请求权限 + 本地定时提醒（页面打开期间生效）
import { dueWords } from './sm2';
import { store } from './store';

export async function ensureNotifyPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  return (await Notification.requestPermission()) === 'granted';
}

let timer: ReturnType<typeof setInterval> | null = null;

/** 每小时检查：到达提醒时刻且有到期词时推送一条通知 */
export function startNotifyLoop() {
  if (timer || !('Notification' in window)) return;
  timer = setInterval(() => {
    const s = store.get();
    if (!s.settings.notify || Notification.permission !== 'granted') return;
    const now = new Date();
    if (now.getHours() < s.settings.notifyHour) return;
    const due = dueWords(s.records, Date.now()).length;
    const todayKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-sent`;
    if (due > 0 && !sessionStorage.getItem(todayKey)) {
      sessionStorage.setItem(todayKey, '1');
      new Notification('词忆 CET · 复习提醒', {
        body: `今天还有 ${due} 个单词待复习，趁热打铁！`,
        icon: './icon.svg',
      });
    }
  }, 30 * 60 * 1000);
}
