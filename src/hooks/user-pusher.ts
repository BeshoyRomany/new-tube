import { useEffect } from 'react';
import PusherClient from 'pusher-js';

interface PusherClientProps {
  channelName: string;
  eventName: string;
  callback: (data: unknown) => void;
}
export const usePusher = ({
  channelName,
  eventName,
  callback,
}: PusherClientProps) => {
  useEffect(() => {
    const pusher = new PusherClient(process.env.NEXT_PUBLIC_PUSHER_APP_KEY!, {
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
    });

    const channel = pusher.subscribe(channelName);

    channel.bind(eventName, callback);

    return () => {
      channel.unbind_all();
      pusher.unsubscribe(channelName);
      pusher.disconnect();
    };
  }, [channelName, eventName, callback]);
};
