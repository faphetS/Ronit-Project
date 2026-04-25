export interface SendMessageResult {
  idMessage: string;
}

export interface GreenApiIncomingWebhook {
  typeWebhook: string;
  instanceData: { idInstance: number; wid: string; typeInstance: string };
  timestamp: number;
  idMessage: string;
  senderData: { chatId: string; sender: string; senderName: string };
  messageData: {
    typeMessage: string;
    textMessageData?: { textMessage: string };
  };
}

export interface WhatsAppProvider {
  sendMessage(chatId: string, message: string): Promise<SendMessageResult>;
}
