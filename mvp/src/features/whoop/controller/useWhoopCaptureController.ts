import { useEffect, useState } from 'react';

import {
  WhoopCaptureController,
  type WhoopCaptureControllerOptions,
  type WhoopCaptureSnapshot
} from '@/features/whoop/controller/WhoopCaptureController.ts';

export type UseWhoopCaptureControllerResult = WhoopCaptureSnapshot & {
  connect: () => Promise<void>;
  resume: () => Promise<void>;
  disconnect: () => Promise<void>;
  exportSession: () => Promise<void>;
};

let sharedController: WhoopCaptureController | null = null;

const getOrCreateController = (options: WhoopCaptureControllerOptions): WhoopCaptureController => {
  if (!sharedController) {
    sharedController = new WhoopCaptureController(options);
  }

  return sharedController;
};

export const resetWhoopCaptureControllerForTests = async (): Promise<void> => {
  if (!sharedController) {
    return;
  }

  await sharedController.destroy();
  sharedController = null;
};

export const useWhoopCaptureController = (
  options: WhoopCaptureControllerOptions = {}
): UseWhoopCaptureControllerResult => {
  const [controller] = useState(() => getOrCreateController(options));
  const [snapshot, setSnapshot] = useState<WhoopCaptureSnapshot>(() => controller.getSnapshot());

  useEffect(() => {
    const unsubscribe = controller.subscribe((nextSnapshot) => {
      setSnapshot(nextSnapshot);
    });

    return () => {
      unsubscribe();
    };
  }, [controller]);

  return {
    ...snapshot,
    connect: async () => {
      await controller.connect();
    },
    resume: async () => {
      await controller.resume();
    },
    disconnect: async () => {
      await controller.disconnect();
    },
    exportSession: async () => {
      await controller.exportCurrentSession();
    }
  };
};
