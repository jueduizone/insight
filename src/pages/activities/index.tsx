import { useEffect, useState } from "react";
import {
  Table,
  Button,
  Modal,
  Upload,
  Select,
  Space,
  Typography,
  Tag,
  message,
  Form,
  Input,
  Card,
  Result,
  Divider,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  PlusOutlined,
  InboxOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  EditOutlined,
  DeleteOutlined,
  BarChartOutlined,
  LoadingOutlined,
} from "@ant-design/icons";
import Layout from "@/components/Layout";
import { apiFetch, API_BASE } from "@/lib/api";

const { Title, Text } = Typography;
const { Dragger } = Upload;
const { Option } = Select;

interface ActivityEvent {
  id: number;
  created_at: string;
  name: string;
  type: string;
  platform: string;
  start_date: string;
  end_date: string;
  description: string;
  participant_count?: number;
  awarded_count?: number;
}

interface EventsData {
  events: ActivityEvent[];
  total: number;
}

interface PreviewData {
  columns: string[];
  rows: string[][];
}

interface ImportResult {
  created: number;
  merged: number;
}

const SYSTEM_FIELDS = [
  "email",
  "last_name",
  "first_name",
  "github",
  "wallet_address",
  "wechat",
  "telegram",
  "existing_projects",
  "intro",
  "monad_experience",
  "joined_at",
  "award",
  "role",
  "status",
] as const;

const FIELD_LABELS: Record<string, string> = {
  email: "邮箱",
  last_name: "姓",
  first_name: "名",
  github: "GitHub",
  wallet_address: "钱包地址",
  wechat: "微信",
  telegram: "Telegram",
  existing_projects: "已有项目",
  intro: "描述",
  monad_experience: "Monad 经验",
  joined_at: "首次加入时间",
  award: "获奖情况",
  role: "角色",
  status: "参与状态",
};

type ImportStep = "upload" | "preview" | "result";

export default function ActivitiesPage() {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [total, setTotal] = useState(0);

  // Create event modal
  const [createOpen, setCreateOpen] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createForm] = Form.useForm();

  // Edit event modal
  const [editOpen, setEditOpen] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [editingEvent, setEditingEvent] = useState<ActivityEvent | null>(null);
  const [editForm] = Form.useForm();

  // Import modal
  const [importOpen, setImportOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<ActivityEvent | null>(
    null
  );
  const [importStep, setImportStep] = useState<ImportStep>("upload");
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [aiMatching, setAiMatching] = useState(false);

  // Analysis modal
  interface AnalysisResult {
    event_id: number;
    event_name: string;
    total_count: number;
    awarded_count: number;
    role_dist: Record<string, number>;
    award_dist: Record<string, number>;
    report: string;
  }
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [analysisEvent, setAnalysisEvent] = useState<ActivityEvent | null>(null);

  const openAnalysis = async (event: ActivityEvent) => {
    setAnalysisEvent(event);
    setAnalysisResult(null);
    setAnalysisOpen(true);
    setAnalysisLoading(true);
    try {
      const res = await apiFetch<AnalysisResult>(`/v1/events/${event.id}/analysis`);
      if (res.code === 200) {
        setAnalysisResult(res.data);
      } else {
        message.error(res.message || "分析失败");
        setAnalysisOpen(false);
      }
    } catch {
      message.error("分析请求失败");
      setAnalysisOpen(false);
    } finally {
      setAnalysisLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents(currentPage);
  }, [currentPage]);

  async function fetchEvents(page: number) {
    setLoading(true);
    try {
      const res = await apiFetch<EventsData>(
        `/v1/events?page=${page}&page_size=20`
      );
      if (res.code === 200) {
        setEvents(res.data.events || []);
        setTotal(res.data.total);
      } else {
        message.error(res.message || "获取活动列表失败");
      }
    } catch {
      message.error("获取活动列表失败");
    } finally {
      setLoading(false);
    }
  }

  const openImport = (event: ActivityEvent) => {
    setSelectedEvent(event);
    setImportStep("upload");
    setCsvFile(null);
    setPreviewData(null);
    setFieldMapping({});
    setImportResult(null);
    setAiMatching(false);
    setImportOpen(true);
  };

  const handlePreview = async (file: File) => {
    if (!selectedEvent) return;
    setCsvFile(file);
    setUploading(true);

    const token =
      typeof window !== "undefined"
        ? localStorage.getItem("insight_token")
        : null;

    const formData = new FormData();
    formData.append("file", file);
    formData.append("mode", "preview");

    try {
      const response = await fetch(
        `${API_BASE}/v1/events/${selectedEvent.id}/import`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token ?? ""}` },
          body: formData,
        }
      );
      const result = (await response.json()) as {
        code: number;
        message: string;
        data: PreviewData;
      };

      if (result.code === 200) {
        setPreviewData(result.data);
        setFieldMapping({});
        setImportStep("preview");
        suggestMapping(result.data.columns);
      } else {
        message.error(result.message || "解析 CSV 失败");
      }
    } catch {
      message.error("解析 CSV 失败");
    } finally {
      setUploading(false);
    }
  };

  const suggestMapping = async (columns: string[]) => {
    setAiMatching(true);
    try {
      const res = await apiFetch<Record<string, string>>("/v1/suggest-mapping", {
        method: "POST",
        body: JSON.stringify({ columns }),
      });
      if (res.code === 200 && res.data) {
        setFieldMapping(res.data);
      }
    } catch {
      // silently degrade — user can map manually
    } finally {
      setAiMatching(false);
    }
  };

  const handleImport = async () => {
    if (!selectedEvent || !csvFile) return;
    setImporting(true);

    const token =
      typeof window !== "undefined"
        ? localStorage.getItem("insight_token")
        : null;

    const formData = new FormData();
    formData.append("file", csvFile);
    formData.append("mode", "import");
    formData.append("field_mapping", JSON.stringify(fieldMapping));

    try {
      const response = await fetch(
        `${API_BASE}/v1/events/${selectedEvent.id}/import`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token ?? ""}` },
          body: formData,
        }
      );
      const result = (await response.json()) as {
        code: number;
        message: string;
        data: ImportResult;
      };

      if (result.code === 200) {
        setImportResult(result.data);
        setImportStep("result");
        fetchEvents(currentPage);
      } else {
        message.error(result.message || "导入失败");
      }
    } catch {
      message.error("导入失败");
    } finally {
      setImporting(false);
    }
  };

  const handleCreateEvent = async (values: Record<string, unknown>) => {
    setCreateLoading(true);
    try {
      const res = await apiFetch("/v1/events", {
        method: "POST",
        body: JSON.stringify({
          name: values.name,
          type: values.type,
          platform: values.platform,
          description: values.description,
          start_date: values.start_date
            ? new Date(values.start_date as string).toISOString()
            : null,
          end_date: values.end_date
            ? new Date(values.end_date as string).toISOString()
            : null,
        }),
      });
      if (res.code === 200 || res.code === 201) {
        message.success("活动创建成功");
        setCreateOpen(false);
        createForm.resetFields();
        fetchEvents(1);
        setCurrentPage(1);
      } else {
        message.error(res.message || "创建失败");
      }
    } catch {
      message.error("创建失败");
    } finally {
      setCreateLoading(false);
    }
  };

  const openEdit = (event: ActivityEvent) => {
    setEditingEvent(event);
    const toDatetimeLocal = (iso: string) => {
      if (!iso || iso.startsWith("0001-")) return "";
      return new Date(iso).toISOString().slice(0, 16);
    };
    editForm.setFieldsValue({
      name: event.name,
      type: event.type || undefined,
      platform: event.platform || undefined,
      description: event.description,
      start_date: toDatetimeLocal(event.start_date),
      end_date: toDatetimeLocal(event.end_date),
    });
    setEditOpen(true);
  };

  const handleEditEvent = async (values: Record<string, unknown>) => {
    if (!editingEvent) return;
    setEditLoading(true);
    try {
      const res = await apiFetch(`/v1/events/${editingEvent.id}`, {
        method: "PUT",
        body: JSON.stringify({
          name: values.name,
          type: values.type ?? "",
          platform: values.platform ?? "",
          description: values.description,
          start_date: values.start_date
            ? new Date(values.start_date as string).toISOString()
            : null,
          end_date: values.end_date
            ? new Date(values.end_date as string).toISOString()
            : null,
        }),
      });
      if (res.code === 200) {
        message.success("活动更新成功");
        setEditOpen(false);
        editForm.resetFields();
        fetchEvents(currentPage);
      } else {
        message.error(res.message || "更新失败");
      }
    } catch {
      message.error("更新失败");
    } finally {
      setEditLoading(false);
    }
  };

  const handleDeleteEvent = (event: ActivityEvent) => {
    Modal.confirm({
      title: "确认删除",
      content: "删除后无法恢复，是否继续？",
      okText: "删除",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: async () => {
        try {
          const res = await apiFetch(`/v1/events/${event.id}`, {
            method: "DELETE",
          });
          if (res.code === 200) {
            message.success("活动已删除");
            fetchEvents(currentPage);
          } else {
            message.error(res.message || "删除失败");
          }
        } catch {
          message.error("删除失败");
        }
      },
    });
  };

  const closeImport = () => {
    setImportOpen(false);
    setSelectedEvent(null);
  };

  // Preview table: transform rows to object array
  const previewTableData = (previewData?.rows ?? []).map((row, idx) => {
    const obj: Record<string, string> & { _key: string } = { _key: String(idx) };
    (previewData?.columns ?? []).forEach((col, i) => {
      obj[`col_${i}`] = row[i] ?? "";
    });
    return obj;
  });

  const previewColumns: ColumnsType<Record<string, string>> = (
    previewData?.columns ?? []
  ).map((col, i) => ({
    title: col,
    dataIndex: `col_${i}`,
    key: `col_${i}`,
    ellipsis: true,
    width: 140,
  }));

  // Events table columns
  const eventColumns: ColumnsType<ActivityEvent> = [
    {
      title: "活动名称",
      dataIndex: "name",
      key: "name",
      render: (name: string) => <Text strong>{name}</Text>,
    },
    {
      title: "类型",
      dataIndex: "type",
      key: "type",
      render: (type: string) =>
        type ? <Tag color="purple">{type}</Tag> : <Text type="secondary">—</Text>,
    },
    {
      title: "平台",
      dataIndex: "platform",
      key: "platform",
      render: (platform: string) =>
        platform ? (
          <Tag color="blue">{platform}</Tag>
        ) : (
          <Text type="secondary">—</Text>
        ),
    },
    {
      title: "开始时间",
      dataIndex: "start_date",
      key: "start_date",
      render: (d: string) =>
        d && !d.startsWith("0001-")
          ? new Date(d).toLocaleDateString("zh-CN")
          : "—",
    },
    {
      title: "结束时间",
      dataIndex: "end_date",
      key: "end_date",
      render: (d: string) =>
        d && !d.startsWith("0001-")
          ? new Date(d).toLocaleDateString("zh-CN")
          : "—",
    },
    {
      title: "参与人数",
      dataIndex: "participant_count",
      key: "participant_count",
      width: 90,
      render: (v: number) => v > 0 ? <Text strong style={{ color: "var(--accent-purple)" }}>{v}</Text> : <Text type="secondary">—</Text>,
    },
    {
      title: "获奖人数",
      dataIndex: "awarded_count",
      key: "awarded_count",
      width: 90,
      render: (v: number, record: ActivityEvent) => {
        if (!record.participant_count || record.participant_count === 0) return <Text type="secondary">—</Text>;
        const rate = v > 0 ? ` (${((v / record.participant_count) * 100).toFixed(0)}%)` : "";
        return v > 0 ? <Text>{v}{rate}</Text> : <Text type="secondary">—</Text>;
      },
    },
    {
      title: "描述",
      dataIndex: "description",
      key: "description",
      ellipsis: true,
      render: (desc: string) => desc || <Text type="secondary">—</Text>,
    },
    {
      title: "操作",
      key: "action",
      width: 180,
      render: (_: unknown, record: ActivityEvent) => (
        <Space size={4}>
          <Button
            size="small"
            type="primary"
            ghost
            style={{ borderColor: "var(--accent-purple)", color: "var(--accent-purple)" }}
            onClick={() => openImport(record)}
          >
            导入 CSV
          </Button>
          <Button
            size="small"
            icon={<BarChartOutlined />}
            title="AI 分析"
            style={{ borderColor: "var(--accent-purple)", color: "var(--accent-purple)" }}
            onClick={() => openAnalysis(record)}
          />
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => openEdit(record)}
          />
          <Button
            size="small"
            danger
            icon={<DeleteOutlined />}
            onClick={() => handleDeleteEvent(record)}
          />
        </Space>
      ),
    },
  ];

  // Import modal footer
  const importFooter = () => {
    if (importStep === "upload") {
      return [
        <Button key="cancel" onClick={closeImport}>
          取消
        </Button>,
      ];
    }
    if (importStep === "preview") {
      return [
        <Button
          key="back"
          onClick={() => setImportStep("upload")}
        >
          重新选择文件
        </Button>,
        <Button key="cancel" onClick={closeImport}>
          取消
        </Button>,
        <Button
          key="import"
          type="primary"
          loading={importing}
          style={{ background: "var(--accent-purple)", borderColor: "var(--accent-purple)" }}
          onClick={handleImport}
        >
          开始导入
        </Button>,
      ];
    }
    return [
      <Button
        key="close"
        type="primary"
        style={{ background: "var(--accent-purple)", borderColor: "var(--accent-purple)" }}
        onClick={closeImport}
      >
        完成
      </Button>,
    ];
  };

  return (
    <>
    <Layout>
      <div style={{ backgroundColor: "var(--bg-primary)", minHeight: "100vh" }}>
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 20,
          }}
        >
          <Title level={4} style={{ margin: 0 }}>
            活动管理
          </Title>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            style={{ background: "var(--accent-purple)", borderColor: "var(--accent-purple)" }}
            onClick={() => setCreateOpen(true)}
          >
            创建活动
          </Button>
        </div>

        {/* Events table */}
        <Table
          columns={eventColumns}
          dataSource={events}
          rowKey="id"
          loading={loading}
          pagination={{
            current: currentPage,
            pageSize: 20,
            total,
            showTotal: (t) => `共 ${t} 条`,
            onChange: (page) => setCurrentPage(page),
          }}
        />
      </div>

      {/* Create Event Modal */}
      <Modal
        title="创建活动"
        open={createOpen}
        onCancel={() => {
          setCreateOpen(false);
          createForm.resetFields();
        }}
        onOk={() => createForm.submit()}
        confirmLoading={createLoading}
        okButtonProps={{
          style: { background: "var(--accent-purple)", borderColor: "var(--accent-purple)" },
        }}
      >
        <Form form={createForm} layout="vertical" onFinish={handleCreateEvent}>
          <Form.Item
            name="name"
            label="活动名称"
            rules={[{ required: true, message: "请输入活动名称" }]}
          >
            <Input placeholder="Monad Hackathon 2025" />
          </Form.Item>
          <Form.Item name="type" label="类型">
            <Select placeholder="请选择活动类型" allowClear>
              <Option value="hackathon">Hackathon</Option>
              <Option value="workshop">Workshop</Option>
              <Option value="meetup">Meetup</Option>
              <Option value="conference">Conference</Option>
              <Option value="other">其他</Option>
            </Select>
          </Form.Item>
          <Form.Item name="platform" label="平台">
            <Select placeholder="请选择平台" allowClear>
              <Option value="online">线上</Option>
              <Option value="offline">线下</Option>
              <Option value="hybrid">混合</Option>
            </Select>
          </Form.Item>
          <Form.Item name="start_date" label="开始时间">
            <Input type="datetime-local" />
          </Form.Item>
          <Form.Item name="end_date" label="结束时间">
            <Input type="datetime-local" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={3} placeholder="活动描述..." />
          </Form.Item>
        </Form>
      </Modal>

      {/* Edit Event Modal */}
      <Modal
        title="编辑活动"
        open={editOpen}
        onCancel={() => {
          setEditOpen(false);
          editForm.resetFields();
        }}
        onOk={() => editForm.submit()}
        confirmLoading={editLoading}
        okButtonProps={{
          style: { background: "var(--accent-purple)", borderColor: "var(--accent-purple)" },
        }}
      >
        <Form form={editForm} layout="vertical" onFinish={handleEditEvent}>
          <Form.Item
            name="name"
            label="活动名称"
            rules={[{ required: true, message: "请输入活动名称" }]}
          >
            <Input placeholder="Monad Hackathon 2025" />
          </Form.Item>
          <Form.Item name="type" label="类型">
            <Select placeholder="请选择活动类型" allowClear>
              <Option value="hackathon">Hackathon</Option>
              <Option value="workshop">Workshop</Option>
              <Option value="meetup">Meetup</Option>
              <Option value="conference">Conference</Option>
              <Option value="other">其他</Option>
            </Select>
          </Form.Item>
          <Form.Item name="platform" label="平台">
            <Select placeholder="请选择平台" allowClear>
              <Option value="online">线上</Option>
              <Option value="offline">线下</Option>
              <Option value="hybrid">混合</Option>
            </Select>
          </Form.Item>
          <Form.Item name="start_date" label="开始时间">
            <Input type="datetime-local" />
          </Form.Item>
          <Form.Item name="end_date" label="结束时间">
            <Input type="datetime-local" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={3} placeholder="活动描述..." />
          </Form.Item>
        </Form>
      </Modal>

      {/* CSV Import Modal */}
      <Modal
        title={
          <Space>
            <CalendarOutlined />
            <span>
              {importStep === "result"
                ? "导入完成"
                : `导入 CSV — ${selectedEvent?.name ?? ""}`}
            </span>
          </Space>
        }
        open={importOpen}
        onCancel={closeImport}
        footer={importFooter()}
        width={importStep === "preview" ? 900 : 520}
        destroyOnClose
      >
        {/* Step 1: Upload */}
        {importStep === "upload" && (
          <div>
            <Text type="secondary" style={{ display: "block", marginBottom: 16 }}>
              上传 CSV 文件后，系统会展示前 5 行数据供预览并配置字段映射。
            </Text>
            <Dragger
              accept=".csv"
              multiple={false}
              showUploadList={false}
              beforeUpload={(file) => {
                handlePreview(file);
                return false;
              }}
              disabled={uploading}
            >
              <p className="ant-upload-drag-icon">
                <InboxOutlined style={{ color: "var(--accent-purple)", fontSize: 48 }} />
              </p>
              <p className="ant-upload-text">点击或拖拽 CSV 文件到此区域</p>
              <p className="ant-upload-hint">
                {uploading ? "正在解析..." : "仅支持 .csv 格式，最大 10MB"}
              </p>
            </Dragger>
          </div>
        )}

        {/* Step 2: Preview + Field Mapping */}
        {importStep === "preview" && previewData && (
          <div>
            <Text strong>数据预览（前 {previewData.rows.length} 行）</Text>
            <Table
              columns={previewColumns}
              dataSource={previewTableData}
              rowKey="_key"
              pagination={false}
              size="small"
              scroll={{ x: "max-content" }}
              style={{ marginTop: 8, marginBottom: 20 }}
            />

            <Divider />

            <Text strong>字段映射配置</Text>
            <Text type="secondary" style={{ display: "block", marginBottom: 12 }}>
              {aiMatching ? "AI 智能匹配中..." : "已由 AI 自动匹配，可手动调整"}
            </Text>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "8px 24px",
              }}
            >
              {SYSTEM_FIELDS.map((field) => (
                <Card
                  key={field}
                  size="small"
                  style={{ background: "var(--bg-card-elevated)", overflow: "hidden" }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <Text style={{ width: 90, flexShrink: 0 }}>
                      {FIELD_LABELS[field]}
                    </Text>
                    <Select
                      value={fieldMapping[field] ?? undefined}
                      onChange={(val: string) =>
                        setFieldMapping((prev) => ({ ...prev, [field]: val }))
                      }
                      onClear={() =>
                        setFieldMapping((prev) => {
                          const next = { ...prev };
                          delete next[field];
                          return next;
                        })
                      }
                      placeholder="选择 CSV 列"
                      allowClear
                      style={{ flex: 1, minWidth: 0, maxWidth: "100%" }}
                      popupMatchSelectWidth={false}
                      size="small"
                    >
                      {previewData.columns.map((col) => (
                        <Option key={col} value={col}>
                          {col}
                        </Option>
                      ))}
                    </Select>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Step 3: Result */}
        {importStep === "result" && importResult && (
          <Result
            icon={<CheckCircleOutlined style={{ color: "var(--accent-purple)" }} />}
            title="导入成功"
            subTitle={
              <Space direction="vertical">
                <Text>
                  新建开发者：<Text strong>{importResult.created}</Text> 人
                </Text>
                <Text>
                  合并已有记录：<Text strong>{importResult.merged}</Text> 条
                </Text>
              </Space>
            }
          />
        )}
      </Modal>

      {/* AI Analysis Modal */}
      <Modal
        title={
          <Space>
            <BarChartOutlined style={{ color: "var(--accent-purple)" }} />
            <span>AI 活动分析 — {analysisEvent?.name}</span>
          </Space>
        }
        open={analysisOpen}
        onCancel={() => setAnalysisOpen(false)}
        footer={
          <Button onClick={() => setAnalysisOpen(false)}>关闭</Button>
        }
        width={700}
      >
        {analysisLoading ? (
          <div style={{ textAlign: "center", padding: "48px 0" }}>
            <Space direction="vertical" align="center" size="middle">
              <LoadingOutlined style={{ fontSize: 36, color: "var(--accent-purple)" }} />
              <Text strong style={{ fontSize: 15 }}>AI 正在生成分析报告...</Text>
              <Text type="secondary" style={{ fontSize: 13 }}>
                正在汇总参与数据并调用 AI 模型，通常需要 1–2 分钟，请耐心等待
              </Text>
              <Text type="secondary" style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                请勿关闭此窗口
              </Text>
            </Space>
          </div>
        ) : analysisResult ? (
          <div>
            {/* Key metrics */}
            <div style={{ display: "flex", gap: 16, marginBottom: 20 }}>
              <Card size="small" style={{ flex: 1, textAlign: "center" }}>
                <div style={{ fontSize: 28, fontWeight: 700, color: "var(--accent-purple)" }}>
                  {analysisResult.total_count}
                </div>
                <Text type="secondary">参与人数</Text>
              </Card>
              <Card size="small" style={{ flex: 1, textAlign: "center" }}>
                <div style={{ fontSize: 28, fontWeight: 700, color: "#c2ef4e" }}>
                  {analysisResult.awarded_count}
                </div>
                <Text type="secondary">获奖人数</Text>
              </Card>
              <Card size="small" style={{ flex: 1, textAlign: "center" }}>
                <div style={{ fontSize: 28, fontWeight: 700, color: "var(--text-secondary)" }}>
                  {analysisResult.total_count > 0
                    ? ((analysisResult.awarded_count / analysisResult.total_count) * 100).toFixed(1)
                    : "0"}%
                </div>
                <Text type="secondary">获奖率</Text>
              </Card>
            </div>

            {/* Role distribution */}
            {Object.keys(analysisResult.role_dist).length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <Text strong>角色分布</Text>
                <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {Object.entries(analysisResult.role_dist).map(([role, cnt]) => (
                    <Tag key={role} color="purple">{role}: {cnt}人</Tag>
                  ))}
                </div>
              </div>
            )}

            {/* Award distribution */}
            {Object.keys(analysisResult.award_dist).length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <Text strong>获奖情况</Text>
                <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {Object.entries(analysisResult.award_dist).map(([award, cnt]) => (
                    <Tag key={award} color="gold">{award}: {cnt}人</Tag>
                  ))}
                </div>
              </div>
            )}

            <Divider />

            {/* AI report */}
            <div>
              <Text strong>AI 分析报告</Text>
              <div
                style={{
                  marginTop: 12,
                  padding: "16px",
                  background: "var(--bg-card-elevated)",
                  borderRadius: 8,
                  whiteSpace: "pre-wrap",
                  lineHeight: 1.8,
                  fontSize: 14,
                  color: "var(--text-primary)",
                  border: "1px solid var(--border-color)",
                }}
              >
                {analysisResult.report}
              </div>
            </div>
          </div>
        ) : null}
      </Modal>
    </Layout>
    </>
  );
}
