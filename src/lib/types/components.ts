export type NotificationDTO = {
  id: string;
  title: string;
  content: string;
  createdAt: Date;
  senderId: string;
  threadId: string | null;
};

export type TicketResponse =
  | {
      success: true;
      notification: NotificationDTO;
    }
  | {
      success: false;
      code: "TICKET_LIMIT_REACHED";
      minutesLeft: number;
    }
  | {
      success: false;
      code: "UNKNOWN_ERROR";
      error: string;
    };


export type Testimonial = {
  id: number;
  name: string;
  role: string;
  company: string;
  message: string;
  avatar: string;
  image?: string;
};