import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';

interface StreakData {
  currentStreak: number;
  longestStreak: number;
  lastActiveDate: string;
  streakEnabled: boolean;
}

export function useStreak(context: string) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['streak', context],
    queryFn: async () => {
      const { data } = await axios.get<{ data: StreakData }>(`/api/${context}/streak`);
      return data.data;
    },
    staleTime: 60_000,
  });

  const checkin = useMutation({
    mutationFn: async () => {
      const { data } = await axios.post<{ data: StreakData }>(`/api/${context}/streak/checkin`);
      return data.data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['streak', context], data);
    },
  });

  return { ...query, checkin };
}
