import { Box, LinearProgress } from '@mui/material';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CacheService, CacheServiceFactory } from '@helpers/cache';
import TopNavigationBar from './TopNavigationBar';
import { ROUTES } from '@config/routes';
import BookRoomView from './BookRoomView';
import MyEventsView from './MyEventsView';
import { Action } from '@helpers/utility';

const cacheService: CacheService = CacheServiceFactory.getCacheService();

export default function Home() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [tabIndex, setTabIndex] = useState(0);

  useEffect(() => {
    cacheService.get('access_token').then((token) => {
      if (!token) {
        navigate(ROUTES.signIn);
        return;
      }

      setLoading(false);
    });
  }, []);

  const onAction = (action: Action) => {
    if (action === Action.ROOM_BOOKED) {
      setTabIndex(1);
    }
  };

  const handleTabChange = (newValue: number) => {
    setTabIndex(newValue);
  };

  return (
    <Box
      sx={{
        flexGrow: 1,
        overflowY: 'auto',
        paddingBottom: '56px',
        position: 'relative',
      }}
    >
      <Box
        display={'flex'}
        alignItems={'center'}
        sx={{
          zIndex: 100,
        }}
      >
        <TopNavigationBar
          sx={{
            pr: 1,
          }}
          tabIndex={tabIndex}
          handleTabChange={handleTabChange}
        />
      </Box>

      {loading && <LinearProgress />}
      {tabIndex === 0 && <BookRoomView onAction={onAction} />}
      {tabIndex === 1 && <MyEventsView />}
    </Box>
  );
}
