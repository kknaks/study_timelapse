// 법적 문서 정적 텍스트 (Option B: 정적 컴포넌트 렌더).
// Phase 2 RevenueCat 출시 전 법무 검토 후 정식 텍스트로 교체 예정.
// 원본: medi_docs/current/policy/policy-03/04/05

export const termsOfService = {
  title: '이용약관',
  version: '초안 v0.2',
  effectiveDate: '2026-05-31 예정 (법무 검토 후 확정)',
  draftWarning: '이 문서는 초안입니다. 법무 검토 전 버전입니다.',
  sections: [
    {
      heading: '제1조 (목적·정의)',
      body: `이 약관은 Summer Star company(이하 "회사")가 제공하는 study_timelapse 서비스(이하 "서비스")의 이용 조건 및 절차를 규정합니다.

정의:
• 회원: 이 약관에 동의하고 서비스에 가입한 개인
• Free 플랜: 무료 이용 플랜 (일일 1회 녹화 한도)
• Pro 구독: 유료 구독 플랜 (무제한 녹화, 워터마크 제거)
• 트라이얼: 신규 가입자에게 제공되는 7일 Pro 무료 체험`,
    },
    {
      heading: '제2조 (약관 효력·변경)',
      body: `이 약관은 가입 화면에 게시되며, 회원이 동의함으로써 효력이 발생합니다.

약관 변경 시 사전 공지:
• 중요 변경: 적용 30일 전 앱 내 공지 또는 이메일 고지
• 경미한 변경: 적용 7일 전 공지

변경 약관에 동의하지 않는 경우 서비스 탈퇴를 요청할 수 있습니다.`,
    },
    {
      heading: '제3조 (회원가입·계정)',
      body: `가입 방법: Google 또는 Apple OAuth 인증으로 가입합니다. 1인 1계정 원칙이며, 다중 계정을 이용한 트라이얼 재사용은 이용약관 위반입니다.`,
    },
    {
      heading: '제4조 (서비스 이용)',
      body: `회원은 서비스를 이용하여 공부 타임랩스 영상을 생성하고 개인 기기에 저장할 수 있습니다. Free 플랜은 일 1회 녹화로 제한됩니다.`,
    },
    {
      heading: '제5조 (Pro 구독·자동 갱신)',
      body: `Pro 구독 요금은 월 $1.99(USD)이며, Apple App Store 또는 Google Play Store를 통해 결제됩니다.

자동 갱신 안내 (Phase 2부터 적용):
• 갱신 주기: 매월 (구매일 기준)
• 갱신 금액: USD $1.99 (스토어 환율에 따라 원화 청구)
• 갱신 시점: 매월 만료 24시간 전 자동 결제
• 사전 고지: 갱신일 14일 전 앱 내 알림 (한국 전자상거래법 의무)
• 취소 방법: Apple App Store / Google Play 구독 관리 화면에서 직접 취소
• 취소 시점: 갱신일 24시간 전까지 취소해야 다음 주기 결제 미발생

구독 해지 후에도 현재 구독 기간 만료 시까지 Pro 기능 이용 가능합니다.`,
    },
    {
      heading: '제6조 (환불)',
      body: `환불은 Apple App Store 또는 Google Play Store의 환불 정책에 따라 처리됩니다. 회사는 직접 환불을 수행하지 않습니다. 자세한 내용은 구독 환불 정책을 확인하세요.`,
    },
    {
      heading: '제7조 (콘텐츠 소유권)',
      body: `회원이 서비스로 생성한 타임랩스 영상의 저작권은 회원에게 있습니다. 회사는 서비스 운영 목적 외에 회원 콘텐츠를 무단 사용하지 않습니다.`,
    },
    {
      heading: '제8조 (서비스 중단·변경)',
      body: `회사는 서비스 점검, 긴급 장애 등의 이유로 서비스를 일시 중단할 수 있습니다. 서비스 종료 시 30일 전 공지합니다.`,
    },
    {
      heading: '제9조 (면책)',
      body: `회사는 천재지변, 불가항력, 회원의 귀책 사유로 인한 서비스 이용 장애에 대해 책임을 지지 않습니다.`,
    },
    {
      heading: '제10조 (준거법·분쟁해결)',
      body: `이 약관은 대한민국 법률을 준거법으로 합니다. 분쟁 발생 시 관할 법원은 서울중앙지방법원으로 합니다.`,
    },
  ],
};

export const privacyPolicy = {
  title: '개인정보처리방침',
  version: '초안 v0.2',
  effectiveDate: '2026-05-31 예정 (법무 검토 후 확정)',
  draftWarning: '이 문서는 초안입니다. 법무 검토 전 버전입니다.',
  sections: [
    {
      heading: '제1조 (수집하는 개인정보 항목)',
      body: `• 이메일 주소 (Google/Apple OAuth, 필수)
• OAuth Subject ID (필수)
• 이름/표시명 (OAuth 프로필, 선택)
• 서비스 이용 기록: 녹화 세션 횟수, 날짜, 길이 (서비스 기능 제공 목적)
• 약관 동의 시각 (terms_agreed_at, privacy_agreed_at)
• 접속 로그, IP 주소 (보안·남용 감지 목적)`,
    },
    {
      heading: '제2조 (개인정보 이용 목적)',
      body: `• 회원 식별 및 서비스 제공
• 구독 관리 (트라이얼/Pro 상태 관리)
• 고객 지원
• 서비스 품질 개선 (익명 통계)`,
    },
    {
      heading: '제3조 (개인정보 보유·이용 기간)',
      body: `• 계정·세션·통계 정보: 회원 탈퇴 시 즉시 삭제
• 결제 이벤트 이력: 5년 보존 (전자상거래법 제6조)
• 약관 동의 이력: 5년 보존
• 접속 로그: 3개월 보존 (통신비밀보호법)`,
    },
    {
      heading: '제4조 (개인정보 제3자 제공·위탁)',
      body: `원칙적으로 회원의 개인정보를 외부에 제공하지 않습니다.

서비스 운영에 활용하는 외부 서비스:
• Apple Inc. — OAuth 인증 (소셜 로그인)
• Google LLC — OAuth 인증 (소셜 로그인)
• RevenueCat Inc. — 결제 처리 위탁 (Phase 2부터). 전달 항목: 사용자 UUID, 구독 이벤트, 영수증 메타데이터
• AWS (Amazon Web Services, Inc.) — 서비스 인프라 운영. 처리 리전: ap-northeast-2 (서울)

국외 이전: Apple·Google·RevenueCat (미국) 에 데이터가 이전됩니다. 각 사의 개인정보처리방침을 병행 확인하십시오.`,
    },
    {
      heading: '제5조 (이용자 권리)',
      body: `회원은 언제든지 자신의 개인정보 열람, 수정, 삭제, 처리정지를 요청할 수 있습니다. 요청은 앱 내 설정(탈퇴) 또는 support@summerstar.example (예시)로 문의해 주세요. 처리 기간: 요청 접수 후 10영업일 이내.`,
    },
    {
      heading: '제6조 (개인정보 안전성 조치)',
      body: `• 전송 구간 암호화 (HTTPS/TLS)
• 접근 권한 최소화
• 정기적 보안 취약점 점검`,
    },
    {
      heading: '제7조 (분석 도구·트래킹)',
      body: `• 쿠키 미사용 (모바일 앱 특성)
• 별도 분석 SDK 미도입. RevenueCat 결제 데이터와 자체 서버 로그만 사용합니다.
• 광고 추적 (IDFA/GAID): 현재 미사용`,
    },
    {
      heading: '제8조 (개인정보보호 책임자)',
      body: `개인정보보호 책임자: [책임자 이름 — 정식 지정 후 교체]\n직책: [직책 — 정식 지정 후 교체]\n이메일: privacy@summerstar.example (예시)`,
    },
  ],
};

export const refundPolicy = {
  title: '구독 환불 정책',
  version: '초안 v0.2',
  effectiveDate: '2026-05-31 예정 (Phase 2 실결제 도입 시)',
  draftWarning: '이 문서는 초안입니다. Phase 1에서는 실제 결제가 발생하지 않습니다.',
  sections: [
    {
      heading: '제1조 (개요)',
      body: `이 정책은 study_timelapse Pro 구독 결제 및 환불에 관한 규칙을 정합니다. Phase 1에서는 mock 결제로 운영되어 실제 결제가 발생하지 않습니다. Phase 2부터 Apple App Store / Google Play Store 실결제가 적용됩니다.`,
    },
    {
      heading: '제2조 (자동 갱신)',
      body: `Phase 2부터 구독은 자동 갱신됩니다.

• 갱신 24시간 전 자동 결제 처리
• 갱신일 14일 전 앱 내 알림으로 사전 고지 (한국 전자상거래법 의무)
• 해지: Apple App Store / Google Play 구독 관리 화면에서 직접 취소
• 갱신일 24시간 전까지 취소해야 다음 주기 결제 미발생`,
    },
    {
      heading: '제3조 (트라이얼)',
      body: `신규 가입 시 7일 무료 Pro 트라이얼이 자동 부여됩니다. 트라이얼 기간에는 요금이 청구되지 않습니다. 트라이얼 종료 전 구독하지 않으면 Free 플랜으로 전환됩니다.`,
    },
    {
      heading: '제4조 (환불 정책)',
      body: `환불은 Apple App Store 또는 Google Play Store의 환불 정책에 따라 처리됩니다. 회사는 직접 환불을 수행하지 않습니다.

환불 신청 방법:
• Apple: App Store → 구독 → 환불 신청 (또는 reportaproblem.apple.com)
• Google: Google Play → 주문 내역 → 환불 요청

회사 귀책 사유(서비스 장애, 오결제 등)인 경우 고객지원 (support@summerstar.example, 예시)으로 문의하시면 스토어 안내를 제공합니다.`,
    },
    {
      heading: '제5조 (일할 환불)',
      body: `구독 기간 중 자발적 해지 시 잔여 일수에 대한 일할 계산 환불은 제공하지 않습니다. Apple/Google 인앱 결제 구조상 일할 환불 처리 주체는 스토어이며, 회사는 직접 개입하지 않습니다.

해지 후에도 현재 구독 기간 만료 시까지 Pro 기능 이용 가능합니다.`,
    },
    {
      heading: '제6조 (자발적 취소 후 서비스 상태)',
      body: `구독을 자발적으로 취소한 경우:
• Pro 기능: pro_until (구독 만료일)까지 유지
• 만료 후: expired 상태로 전환, Pro 기능 해제

스토어 환불 처리 시에는 Pro 권한이 즉시 해제됩니다.`,
    },
    {
      heading: '제7조 (결제 수단 문제 — Grace Period)',
      body: `결제 갱신 실패(카드 만료, 한도 초과 등) 시 플랫폼이 Grace Period를 부여합니다.

• Apple App Store: 최대 16일
• Google Play Store: 최대 30일

Grace Period 동안 Pro 기능이 유지됩니다. 앱 내에 "결제 수단을 업데이트해주세요" 안내가 표시됩니다. Grace Period 내 결제 수단 업데이트 시 정상 갱신됩니다. 기간 내 미업데이트 시 만료 처리되며 Pro 기능이 해제됩니다.`,
    },
    {
      heading: '제8조 (분쟁 해결)',
      body: `• 1차: 고객지원 이메일 (support@summerstar.example, 예시)로 문의
• 2차: 한국소비자원 또는 전자문서·전자거래 분쟁조정위원회에 조정 신청
• 3차: 법원 — 준거법 대한민국법, 관할 법원은 서울중앙지방법원으로 합니다.`,
    },
  ],
};
