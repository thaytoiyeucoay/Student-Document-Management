import type { Document, Subject } from '../types';

export const initialSubjects: Subject[] = [
  { id: '1', name: 'Cơ sở dữ liệu', semester: '2024.1' },
  { id: '2', name: 'Mạng máy tính', semester: '2024.2' },
  { id: '3', name: 'Trí tuệ nhân tạo', semester: '2025.1' },
];

export const initialDocuments: Document[] = [
  {
    id: '1',
    subjectId: '1',
    name: 'Giáo trình SQL cơ bản',
    describes: 'Tài liệu nhập môn về SQL, bao gồm các câu lệnh truy vấn, tạo bảng và quản lý dữ liệu.',
    author: 'Trường ĐH Bách Khoa',
    link: '',
  },
  {
    id: '2',
    subjectId: '1',
    name: 'Slide bài giảng: Chuẩn hóa CSDL',
    describes: 'Tổng hợp các dạng chuẩn hóa 1NF, 2NF, 3NF, BCNF kèm ví dụ minh họa.',
    author: 'Giảng viên A',
    link: '',
  },
  {
    id: '3',
    subjectId: '2',
    name: 'Mô hình OSI và TCP/IP',
    describes: 'Phân tích chi tiết 7 lớp của mô hình OSI và so sánh với mô hình TCP/IP.',
    author: 'Cisco',
    link: 'https://www.cisco.com/c/en/us/support/docs/ip/routing-information-protocol-rip/13769-5.html',
  },
  {
    id: '4',
    subjectId: '3',
    name: 'Deep Learning with Python',
    describes: 'Sách hướng dẫn xây dựng các mô hình học sâu sử dụng Keras và TensorFlow.',
    author: 'François Chollet',
    link: '',
  },
];
