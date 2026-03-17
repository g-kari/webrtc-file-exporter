// WebRTC 関連の型定義（Workers 環境には DOM 型が含まれないため）

interface RTCSessionDescriptionInit {
  type: RTCSdpType;
  sdp?: string;
}

type RTCSdpType = "answer" | "offer" | "pranswer" | "rollback";

interface RTCIceCandidateInit {
  candidate?: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
}

interface RTCIceServer {
  credential?: string;
  urls: string | string[];
  username?: string;
}
