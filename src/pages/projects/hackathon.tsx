import { useEffect, useState, useCallback } from "react";
import {
  Table,
  Button,
  Modal,
  Select,
  Space,
  Typography,
  Tag,
  message,
  Card,
  Upload,
  Divider,
  Result,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  UploadOutlined,
  InboxOutlined,
  CheckCircleOutlined,
} from "@ant-design/icons";
import Layout from "@/components/Layout";
import { apiFetch, API_BASE } from "@/lib/api";

const { Title, Text } = Typography;
const { Dragger } = Upload;
const { Option } = Select;

interface Project {
  id: number;
  name: string;
  description: string;
  github: string;
  site: string;
  tags: string[] | null;
  event_id: number;
  team_name: string;
  members: string;
  score: number;
  rank: number;
  status: string;
  award_level: string;
}

interface ProjectsData {
  projects: Project[];
  total: number;
}

interface ActivityEvent {
  id: number;
  name: string;
  type: string;
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
  updated: number;
}

const SYSTEM_FIELDS = [
  "name",
  "description",
  "github",
  "site",
  "team_name",
  "members",
  "score",
  "rank",
  "status",
  "award_level",
  "tags",
] as const;

type SystemField = (typeof SYSTEM_FIELDS)[number];

const FIELD_LABELS: Record<SystemField, string> = {
  name: "项目名称（必填）",
  description: "描述",
  github: "GitHub",
  site: "网站",
  team_name: "团队名",
  members: "成员",
  score: "评分",
  rank: "排名",
  status: "状态",
  award_level: "获奖等级",
  tags: "标签",
};

type ImportStep = "upload" | "preview" | "result";

function awardColor(level: string): string {
  switch (level) {
    case "gold":
      return "gold";
    case "silver":
      return "silver";
    case "bronze":
      return "orange";
    case "honorable":
      return "default";
    default:
      return "default";
  }
}

export default function HackathonPage() {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<number | undefined>(undefined);

  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [projectsTotal, setProjectsTotal] = useState(0);
  const [projectsPage, setProjectsPage] = useState(1);

  const [importOpen, setImportOpen] = useState(false);
  const [importStep, setImportStep] = useState<ImportStep>("upload");
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [fieldMapping, setFieldMapping] = useState<Partial<Record<SystemField, string>>>({});
  const [uploading, setUploading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const fetchProjects = useCallback(async (page: number) => {
    setProjectsLoading(true);
    try {
      const res = await apiFetch<ProjectsData>(
        `/v1/projects?page=${page}&page_size=20`
      );
      if (res.code === 200) {
        setProjects(res.data.projects || []);
        setProjectsTotal(res.data.total);
      } else {
        message.error(res.message || "获取项目列表失败");
      }
    } catch {
      message.error("获取项目列表失败");
    } finally {
      setProjectsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects(projectsPage);
  }, [projectsPage, fetchProjects]);

  useEffect(() => {
    apiFetch<EventsData>("/v1/events?page=1&page_size=100")
      .then((res) => {
        if (res.code === 200) setEvents(res.data.events || []);
      })
      .catch(() => {});
  }, []);

  const openImport = () => {
    setImportStep("upload");
    setCsvFile(null);
    setPreviewData(null);
    setFieldMapping({});
    setImportResult(null);
    setImportOpen(true);
  };

  const closeImport = () => {
    setImportOpen(false);
  };

  const handlePreview = async (file: File) => {
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
      const response = await fetch(`${API_BASE}/v1/projects/hackathon/import`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token ?? ""}` },
        body: formData,
      });
      const result = (await response.json()) as {
        code: number;
        message: string;
        data: PreviewData;
      };

      if (result.code === 200) {
        setPreviewData(result.data);
        const autoMap: Partial<Record<SystemField, string>> = {};
        SYSTEM_FIELDS.forEach((field) => {
          const col = result.data.columns.find((c) =>
            c.toLowerCase().replace(/[\s_-]/g, "").includes(field.replace(/_/g, ""))
          );
          if (col) autoMap[field] = col;
        });
        setFieldMapping(autoMap);
        setImportStep("preview");
      } else {
        message.error(result.message || "解析 CSV 失败");
      }
    } catch {
      message.error("解析 CSV 失败");
    } finally {
      setUploading(false);
    }
  };

  const handleImport = async () => {
    if (!csvFile) return;
    setImporting(true);
    const token =
      typeof window !== "undefined"
        ? localStorage.getItem("insight_token")
        : null;

    const formData = new FormData();
    formData.append("file", csvFile);
    formData.append("mode", "import");
    formData.append("field_mapping", JSON.stringify(fieldMapping));
    if (selectedEventId) {
      formData.append("event_id", String(selectedEventId));
    }

    try {
      const response = await fetch(`${API_BASE}/v1/projects/hackathon/import`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token ?? ""}` },
        body: formData,
      });
      const result = (await response.json()) as {
        code: number;
        message: string;
        data: ImportResult;
      };

      if (result.code === 200) {
        setImportResult(result.data);
        setImportStep("result");
        fetchProjects(1);
        setProjectsPage(1);
      } else {
        message.error(result.message || "导入失败");
      }
    } catch {
      message.error("导入失败");
    } finally {
      setImporting(false);
    }
  };

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
        <Button key="back" onClick={() => setImportStep("upload")}>
          重新选择文件
        </Button>,
        <Button key="cancel" onClick={closeImport}>
          取消
        </Button>,
        <Button
          key="import"
          type="primary"
          loading={importing}
          style={{ background: "#7c3aed", borderColor: "#7c3aed" }}
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
        style={{ background: "#7c3aed", borderColor: "#7c3aed" }}
        onClick={closeImport}
      >
        完成
      </Button>,
    ];
  };

  const projectColumns: ColumnsType<Project> = [
    {
      title: "项目名称",
      dataIndex: "name",
      key: "name",
      render: (name: string) => <Text strong>{name}</Text>,
    },
    {
      title: "团队名",
      dataIndex: "team_name",
      key: "team_name",
      render: (v: string) => v || <Text type="secondary">—</Text>,
    },
    {
      title: "GitHub",
      dataIndex: "github",
      key: "github",
      render: (v: string) =>
        v ? (
          <a href={v} target="_blank" rel="noopener noreferrer">
            链接
          </a>
        ) : (
          <Text type="secondary">—</Text>
        ),
    },
    {
      title: "评分",
      dataIndex: "score",
      key: "score",
      render: (v: number) => (v ? v.toFixed(2) : <Text type="secondary">—</Text>),
    },
    {
      title: "排名",
      dataIndex: "rank",
      key: "rank",
      render: (v: number) => v || <Text type="secondary">—</Text>,
    },
    {
      title: "获奖等级",
      dataIndex: "award_level",
      key: "award_level",
      render: (v: string) =>
        v ? (
          <Tag color={awardColor(v)}>{v}</Tag>
        ) : (
          <Text type="secondary">—</Text>
        ),
    },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      render: (v: string) => v || <Text type="secondary">—</Text>,
    },
    {
      title: "标签",
      dataIndex: "tags",
      key: "tags",
      render: (tags: string[] | null) =>
        tags && tags.length > 0 ? (
          <Space size={4} wrap>
            {tags.map((t) => (
              <Tag key={t} color="cyan">
                {t}
              </Tag>
            ))}
          </Space>
        ) : (
          <Text type="secondary">—</Text>
        ),
    },
  ];

  return (
    <Layout>
      <div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 20,
          }}
        >
          <Title level={4} style={{ margin: 0 }}>
            Hackathon 项目导入
          </Title>
          <Space>
            <Select
              placeholder="关联活动（可选）"
              allowClear
              style={{ width: 240 }}
              value={selectedEventId}
              onChange={(v: number | undefined) => setSelectedEventId(v)}
            >
              {events.map((e) => (
                <Option key={e.id} value={e.id}>
                  {e.name}
                </Option>
              ))}
            </Select>
            <Button
              type="primary"
              icon={<UploadOutlined />}
              style={{ background: "#7c3aed", borderColor: "#7c3aed" }}
              onClick={openImport}
            >
              导入 CSV
            </Button>
          </Space>
        </div>

        <Table
          columns={projectColumns}
          dataSource={projects}
          rowKey="id"
          loading={projectsLoading}
          pagination={{
            current: projectsPage,
            pageSize: 20,
            total: projectsTotal,
            showTotal: (t) => `共 ${t} 条`,
            onChange: (page) => setProjectsPage(page),
          }}
        />
      </div>

      <Modal
        title="导入 Hackathon 项目"
        open={importOpen}
        onCancel={closeImport}
        footer={importFooter()}
        width={importStep === "preview" ? 900 : 520}
        destroyOnClose
      >
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
                <InboxOutlined style={{ color: "#7c3aed", fontSize: 48 }} />
              </p>
              <p className="ant-upload-text">点击或拖拽 CSV 文件到此区域</p>
              <p className="ant-upload-hint">
                {uploading ? "正在解析..." : "仅支持 .csv 格式，最大 10MB"}
              </p>
            </Dragger>
          </div>
        )}

        {importStep === "preview" && previewData && (
          <div>
            <Text strong>
              数据预览（前 {previewData.rows.length} 行）
            </Text>
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
              将 CSV 列映射到系统字段（留空则忽略该字段）
            </Text>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "8px 24px",
              }}
            >
              {SYSTEM_FIELDS.map((field) => (
                <Card key={field} size="small" style={{ background: "#fafafa" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Text style={{ width: 110, flexShrink: 0 }}>
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
                      style={{ flex: 1 }}
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

        {importStep === "result" && importResult && (
          <Result
            icon={<CheckCircleOutlined style={{ color: "#7c3aed" }} />}
            title="导入成功"
            subTitle={
              <Space direction="vertical">
                <Text>
                  新建项目：<Text strong>{importResult.created}</Text> 个
                </Text>
                <Text>
                  更新项目：<Text strong>{importResult.updated}</Text> 个
                </Text>
              </Space>
            }
          />
        )}
      </Modal>
    </Layout>
  );
}
