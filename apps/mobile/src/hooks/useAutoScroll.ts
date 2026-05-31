import { useCallback, useRef, useState } from "react";
import type { FlatList, NativeScrollEvent, NativeSyntheticEvent } from "react-native";

const BOTTOM_THRESHOLD = 100;

export function useAutoScroll() {
  const flatListRef = useRef<FlatList>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const distanceFromBottom = contentSize.height - layoutMeasurement.height - contentOffset.y;
    setIsAtBottom(distanceFromBottom < BOTTOM_THRESHOLD);
  }, []);

  const scrollToEnd = useCallback(() => {
    flatListRef.current?.scrollToEnd({ animated: true });
    setIsAtBottom(true);
  }, []);

  const onContentSizeChange = useCallback(() => {
    if (isAtBottom) {
      flatListRef.current?.scrollToEnd({ animated: true });
    }
  }, [isAtBottom]);

  return { flatListRef, isAtBottom, onScroll, onContentSizeChange, scrollToEnd };
}
