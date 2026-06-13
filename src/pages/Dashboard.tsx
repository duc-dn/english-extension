import React, { useEffect, useState } from 'react';
import { Row, Col, Card, Statistic, Typography, Tooltip, Table, Tag, Progress } from 'antd';
import { BookOpen, Calendar, CheckCircle, AlertCircle, Award } from 'lucide-react';
import { ActivityCalendar } from 'react-activity-calendar';
import { db, getWordsToReview, getFrequentlyMissedWords, getMasteryStats, type Word } from '../lib/db';
import { useSettings } from '../lib/settings';
import { translate } from '../lib/localization';

const { Title, Text } = Typography;

export const Dashboard: React.FC = () => {
  const [totalWords, setTotalWords] = useState(0);
  const [wordsToReview, setWordsToReview] = useState(0);
  const [activityData, setActivityData] = useState<any[]>([]);
  const [streak, setStreak] = useState(0);
  const [missedWords, setMissedWords] = useState<Word[]>([]);
  const [masteryStats, setMasteryStats] = useState({ new: 0, learning: 0, reviewing: 0, mastered: 0, total: 0 });

  const settings = useSettings();
  const currentLang = settings.language || 'vi';

  useEffect(() => {
    const fetchData = async () => {
      const total = await db.words.count();
      setTotalWords(total);

      const toReview = await getWordsToReview();
      setWordsToReview(toReview.length);

      const stats = await getMasteryStats();
      setMasteryStats(stats);

      // Generate activity data
      const words = await db.words.toArray();
      const reviews = await db.review_history.toArray();

      const counts: Record<string, number> = {};

      words.forEach(w => {
        const dateStr = w.created_at.toISOString().split('T')[0];
        counts[dateStr] = (counts[dateStr] || 0) + 1;
      });

      reviews.forEach(r => {
        const dateStr = r.reviewed_at.toISOString().split('T')[0];
        counts[dateStr] = (counts[dateStr] || 0) + 1;
      });

      // Calculate Current Streak
      let currentStreak = 0;
      const checkDate = new Date();
      let dStr = checkDate.toISOString().split('T')[0];
      
      if (counts[dStr] > 0) currentStreak++;
      
      checkDate.setDate(checkDate.getDate() - 1);
      dStr = checkDate.toISOString().split('T')[0];
      
      if (counts[dStr] > 0 || currentStreak > 0) {
        while (true) {
          if (counts[dStr] > 0) {
            currentStreak++;
            checkDate.setDate(checkDate.getDate() - 1);
            dStr = checkDate.toISOString().split('T')[0];
          } else {
            break;
          }
        }
      }
      setStreak(currentStreak);

      const missed = await getFrequentlyMissedWords(5);
      setMissedWords(missed);

      // Create last 365 days of data
      const data = [];
      const today = new Date();
      for (let i = 365; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        const count = counts[dateStr] || 0;
        
        let level = 0;
        if (count > 0 && count <= 2) level = 1;
        else if (count > 2 && count <= 5) level = 2;
        else if (count > 5 && count <= 10) level = 3;
        else if (count > 10) level = 4;

        data.push({
          date: dateStr,
          count: count,
          level: level
        });
      }

      setActivityData(data);
    };
    
    fetchData();
  }, []);

  return (
    <div style={{ animation: 'fadeIn 0.5s ease', display: 'flex', flexDirection: 'column', gap: 24, paddingBottom: 24 }}>
      <div>
        <Text type="secondary" style={{ fontSize: 16, letterSpacing: '0.5px', textTransform: 'uppercase', fontWeight: 600 }}>
          {translate('welcomeBack', currentLang)}
        </Text>
        <Title level={2} style={{ margin: '4px 0 0 0', fontWeight: 700 }}>
          {translate('whatToLearn', currentLang)}
        </Title>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={8}>
          <Card className="glass-card hover-lift" bordered={false} style={{ overflow: 'hidden', position: 'relative' }}>
            <div style={{ position: 'absolute', top: -20, right: -20, opacity: 0.1, transform: 'scale(2)' }}>
              <BookOpen size={100} color="#6366f1" />
            </div>
            <Statistic
              title={<span style={{ fontWeight: 600, color: '#64748b' }}>{translate('totalVocab', currentLang)}</span>}
              value={totalWords}
              valueStyle={{ color: '#334155', fontWeight: 800, fontSize: 36 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card className="glass-card hover-lift" bordered={false} style={{ overflow: 'hidden', position: 'relative' }}>
            <div style={{ position: 'absolute', top: -20, right: -20, opacity: 0.1, transform: 'scale(2)' }}>
              <Calendar size={100} color="#ec4899" />
            </div>
            <Statistic
              title={<span style={{ fontWeight: 600, color: '#64748b' }}>{translate('dueToday', currentLang)}</span>}
              value={wordsToReview}
              valueStyle={{ color: '#ec4899', fontWeight: 800, fontSize: 36 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card className="glass-card hover-lift" bordered={false} style={{ overflow: 'hidden', position: 'relative' }}>
            <div style={{ position: 'absolute', top: -20, right: -20, opacity: 0.1, transform: 'scale(2)' }}>
              <CheckCircle size={100} color="#10b981" />
            </div>
            <Statistic
              title={<span style={{ fontWeight: 600, color: '#64748b' }}>{translate('streak', currentLang)}</span>}
              value={streak}
              suffix={<span style={{ fontSize: 16, fontWeight: 500, color: '#94a3b8' }}>{translate('days', currentLang)}</span>}
              valueStyle={{ color: '#10b981', fontWeight: 800, fontSize: 36 }}
            />
          </Card>
        </Col>
      </Row>

      {/* Mastery Stats Section */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
          <Title level={4} style={{ fontWeight: 700, color: '#334155', margin: 0 }}>
            {translate('masteryByLevel', currentLang)}
          </Title>
          <div style={{ minWidth: 260, flex: '1 1 auto', maxWidth: 400, display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 13, color: '#64748b', fontWeight: 600, whiteSpace: 'nowrap' }}>
              {translate('masteryRate', currentLang)}:
            </span>
            <Progress 
              percent={Math.round((masteryStats.mastered / (masteryStats.total || 1)) * 100)} 
              strokeColor="linear-gradient(90deg, #10b981 0%, #3b82f6 100%)"
              status="active"
              style={{ margin: 0 }}
            />
          </div>
        </div>

        <Row gutter={[16, 16]}>
          <Col xs={12} sm={6}>
            <Card className="glass-card hover-lift" bordered={false} bodyStyle={{ padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ padding: 8, background: '#eff6ff', borderRadius: 8, display: 'flex', alignItems: 'center' }}>
                  <BookOpen size={20} color="#3b82f6" />
                </div>
                <div>
                  <div style={{ fontSize: 13, color: '#64748b', fontWeight: 500 }}>
                    {translate('newWords', currentLang)} (New)
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#1e293b' }}>{masteryStats.new}</div>
                </div>
              </div>
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card className="glass-card hover-lift" bordered={false} bodyStyle={{ padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ padding: 8, background: '#fff7ed', borderRadius: 8, display: 'flex', alignItems: 'center' }}>
                  <Award size={20} color="#f97316" />
                </div>
                <div>
                  <div style={{ fontSize: 13, color: '#64748b', fontWeight: 500 }}>
                    {translate('learning', currentLang)} (Learning)
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#1e293b' }}>{masteryStats.learning}</div>
                </div>
              </div>
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card className="glass-card hover-lift" bordered={false} bodyStyle={{ padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ padding: 8, background: '#f5f3ff', borderRadius: 8, display: 'flex', alignItems: 'center' }}>
                  <Calendar size={20} color="#8b5cf6" />
                </div>
                <div>
                  <div style={{ fontSize: 13, color: '#64748b', fontWeight: 500 }}>
                    {translate('reviewing', currentLang)} (Reviewing)
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#1e293b' }}>{masteryStats.reviewing}</div>
                </div>
              </div>
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card className="glass-card hover-lift" bordered={false} bodyStyle={{ padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ padding: 8, background: '#f0fdf4', borderRadius: 8, display: 'flex', alignItems: 'center' }}>
                  <CheckCircle size={20} color="#10b981" />
                </div>
                <div>
                  <div style={{ fontSize: 13, color: '#64748b', fontWeight: 500 }}>
                    {translate('mastered', currentLang)} (Mastered)
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#10b981' }}>{masteryStats.mastered}</div>
                </div>
              </div>
            </Card>
          </Col>
        </Row>
      </div>
      
      <div>
        <Title level={4} style={{ fontWeight: 700, color: '#334155' }}>
          {translate('learningHistory', currentLang)}
        </Title>
        <Card className="glass-card hover-lift" style={{ padding: '24px 0', overflowX: 'auto' }}>
          <div style={{ minWidth: 800, display: 'flex', justifyContent: 'center' }}>
            {activityData.length > 0 && (
              <ActivityCalendar 
                data={activityData} 
                theme={{
                  light: ['#f1f5f9', '#c7d2fe', '#818cf8', '#4f46e5', '#312e81'],
                  dark: ['#1e293b', '#3730a3', '#4f46e5', '#818cf8', '#c7d2fe'],
                }}
                labels={{
                  totalCount: currentLang === 'vi' ? '{{count}} hoạt động trong năm qua' : '{{count}} activities in the past year',
                }}
                renderBlock={(block: any, activity: any) => (
                  <Tooltip title={currentLang === 'vi' 
                    ? `${activity.count} hoạt động vào ngày ${activity.date}` 
                    : `${activity.count} activities on ${activity.date}`}>
                    {block}
                  </Tooltip>
                )}
              />
            )}
          </div>
        </Card>
      </div>

      {missedWords.length > 0 && (
        <div>
          <Title level={4} style={{ fontWeight: 700, color: '#334155', display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertCircle color="#ef4444" /> {translate('frequentlyMissed', currentLang)}
          </Title>
          <Card className="glass-card hover-lift" style={{ padding: 0, overflow: 'hidden' }}>
            <Table 
              dataSource={missedWords} 
              pagination={false} 
              rowKey="id"
              columns={[
                { title: translate('word', currentLang), dataIndex: 'word', key: 'word', render: (t) => <strong style={{ fontSize: 16, color: '#1e293b' }}>{t}</strong> },
                { title: translate('meaning', currentLang), dataIndex: 'meaning', key: 'meaning' },
                { title: translate('missedTimes', currentLang), dataIndex: 'wrong_count', key: 'wrong_count', render: (c) => <Tag color="error" style={{ margin: 0, borderRadius: 12 }}>{c} {translate('times', currentLang)}</Tag> }
              ]}
            />
          </Card>
        </div>
      )}
      
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};
