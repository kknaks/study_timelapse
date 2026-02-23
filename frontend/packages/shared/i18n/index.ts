// ============================================
// Study Timelapse - 다국어 번역
// ============================================

import type { SupportedLocale } from '../types';

export const translations: Record<SupportedLocale, Record<string, string>> = {
  ko: {
    // 메인
    'app.title': 'Study Timelapse',
    'app.subtitle': '공부 시간을 타임랩스로 기록하세요',

    // 타이머 설정
    'timer.setup.title': '공부 시간 설정',
    'timer.setup.hours': '시간',
    'timer.setup.minutes': '분',
    'timer.setup.output': '타임랩스 길이',
    'timer.setup.seconds': '초',
    'timer.setup.start': '시작',

    // 녹화 중
    'recording.title': '공부 중',
    'recording.elapsed': '경과 시간',
    'recording.remaining': '남은 시간',
    'recording.pause': '일시정지',
    'recording.resume': '재개',
    'recording.stop': '종료',
    'recording.warning': '탭을 전환하면 녹화가 중단될 수 있습니다',

    // 변환
    'conversion.uploading': '영상 업로드 중...',
    'conversion.processing': '타임랩스 변환 중...',
    'conversion.progress': '진행률',

    // 완료
    'complete.title': '타임랩스 완성!',
    'complete.speed': '배속',
    'complete.duration': '영상 길이',
    'complete.download': '다운로드',
    'complete.retry': '다시 촬영',

    // 에러
    'error.camera': '카메라 접근 권한이 필요합니다',
    'error.upload': '업로드에 실패했습니다. 다시 시도해주세요',
    'error.conversion': '변환에 실패했습니다. 다시 시도해주세요',
  },

  en: {
    'app.title': 'Study Timelapse',
    'app.subtitle': 'Record your study time as a timelapse',

    'timer.setup.title': 'Set Study Time',
    'timer.setup.hours': 'Hours',
    'timer.setup.minutes': 'Minutes',
    'timer.setup.output': 'Timelapse Length',
    'timer.setup.seconds': 'sec',
    'timer.setup.start': 'Start',

    'recording.title': 'Studying',
    'recording.elapsed': 'Elapsed',
    'recording.remaining': 'Remaining',
    'recording.pause': 'Pause',
    'recording.resume': 'Resume',
    'recording.stop': 'Stop',
    'recording.warning': 'Switching tabs may interrupt recording',

    'conversion.uploading': 'Uploading video...',
    'conversion.processing': 'Creating timelapse...',
    'conversion.progress': 'Progress',

    'complete.title': 'Timelapse Ready!',
    'complete.speed': 'Speed',
    'complete.duration': 'Duration',
    'complete.download': 'Download',
    'complete.retry': 'Record Again',

    'error.camera': 'Camera access is required',
    'error.upload': 'Upload failed. Please try again',
    'error.conversion': 'Conversion failed. Please try again',
  },

  zh: {
    'app.title': 'Study Timelapse',
    'app.subtitle': '将你的学习时间录制为延时视频',

    'timer.setup.title': '设置学习时间',
    'timer.setup.hours': '小时',
    'timer.setup.minutes': '分钟',
    'timer.setup.output': '延时视频长度',
    'timer.setup.seconds': '秒',
    'timer.setup.start': '开始',

    'recording.title': '学习中',
    'recording.elapsed': '已用时间',
    'recording.remaining': '剩余时间',
    'recording.pause': '暂停',
    'recording.resume': '继续',
    'recording.stop': '结束',
    'recording.warning': '切换标签页可能会中断录制',

    'conversion.uploading': '正在上传视频...',
    'conversion.processing': '正在制作延时视频...',
    'conversion.progress': '进度',

    'complete.title': '延时视频完成！',
    'complete.speed': '倍速',
    'complete.duration': '视频长度',
    'complete.download': '下载',
    'complete.retry': '重新录制',

    'error.camera': '需要相机访问权限',
    'error.upload': '上传失败，请重试',
    'error.conversion': '转换失败，请重试',
  },

  ja: {
    'app.title': 'Study Timelapse',
    'app.subtitle': '勉強時間をタイムラプスで記録しよう',

    'timer.setup.title': '勉強時間の設定',
    'timer.setup.hours': '時間',
    'timer.setup.minutes': '分',
    'timer.setup.output': 'タイムラプスの長さ',
    'timer.setup.seconds': '秒',
    'timer.setup.start': 'スタート',

    'recording.title': '勉強中',
    'recording.elapsed': '経過時間',
    'recording.remaining': '残り時間',
    'recording.pause': '一時停止',
    'recording.resume': '再開',
    'recording.stop': '終了',
    'recording.warning': 'タブを切り替えると録画が中断される場合があります',

    'conversion.uploading': '動画をアップロード中...',
    'conversion.processing': 'タイムラプスを作成中...',
    'conversion.progress': '進捗',

    'complete.title': 'タイムラプス完成！',
    'complete.speed': '倍速',
    'complete.duration': '動画の長さ',
    'complete.download': 'ダウンロード',
    'complete.retry': 'もう一度撮影',

    'error.camera': 'カメラへのアクセス許可が必要です',
    'error.upload': 'アップロードに失敗しました。もう一度お試しください',
    'error.conversion': '変換に失敗しました。もう一度お試しください',
  },

  es: {
    'app.title': 'Study Timelapse',
    'app.subtitle': 'Graba tu tiempo de estudio en timelapse',

    'timer.setup.title': 'Configurar Tiempo',
    'timer.setup.hours': 'Horas',
    'timer.setup.minutes': 'Minutos',
    'timer.setup.output': 'Duración del Timelapse',
    'timer.setup.seconds': 'seg',
    'timer.setup.start': 'Iniciar',

    'recording.title': 'Estudiando',
    'recording.elapsed': 'Transcurrido',
    'recording.remaining': 'Restante',
    'recording.pause': 'Pausar',
    'recording.resume': 'Reanudar',
    'recording.stop': 'Detener',
    'recording.warning': 'Cambiar de pestaña puede interrumpir la grabación',

    'conversion.uploading': 'Subiendo video...',
    'conversion.processing': 'Creando timelapse...',
    'conversion.progress': 'Progreso',

    'complete.title': '¡Timelapse Listo!',
    'complete.speed': 'Velocidad',
    'complete.duration': 'Duración',
    'complete.download': 'Descargar',
    'complete.retry': 'Grabar de nuevo',

    'error.camera': 'Se requiere acceso a la cámara',
    'error.upload': 'Error al subir. Inténtalo de nuevo',
    'error.conversion': 'Error en la conversión. Inténtalo de nuevo',
  },
};

/** 번역 함수 생성 */
export function createTranslator(locale: SupportedLocale) {
  const dict = translations[locale] ?? translations.en;
  return function t(key: string): string {
    return dict[key] ?? key;
  };
}

/** 기본 언어 */
export const DEFAULT_LOCALE: SupportedLocale = 'ko';

/** 지원 언어 목록 */
export const SUPPORTED_LOCALES: SupportedLocale[] = ['ko', 'zh', 'ja', 'en', 'es'];

/** 언어 표시명 */
export const LOCALE_NAMES: Record<SupportedLocale, string> = {
  ko: '한국어',
  zh: '中文',
  ja: '日本語',
  en: 'English',
  es: 'Español',
};
