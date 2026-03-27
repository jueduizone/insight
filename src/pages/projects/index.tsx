import { useEffect, useState, useCallback } from "react";
import {
  Table,
  Button,
  Modal,
  Input,
  Select,
  Space,
  Typography,
  Tag,
  message,
  Form,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import Layout from "@/components/Layout";
import { apiFetch } from "@/lib/api";

const { Title, Text } = Typography;

interface Project {
  id: number;
  created_at: string;
  name: string;
  description: string;
  github: string;
  site: string;
  cover_image: string;
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
  page: number;
  page_size: number;
}

interface ProjectFormValues {
  name: string;
  description?: string;
  github?: string;
  site?: string;
  tags?: string[];
}

const formItemStyle = { marginBottom: 12 };

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [keyword, setKeyword] = useState("");
  const [searchInput, setSearchInput] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createForm] = Form.useForm<ProjectFormValues>();

  const [editOpen, setEditOpen] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [editForm] = Form.useForm<ProjectFormValues>();

  const fetchProjects = useCallback(
    async (page: number, kw: string) => {
      setLoading(true);
      try {
        const qs = `/v1/projects?page=${page}&page_size=20${kw ? `&keyword=${encodeURIComponent(kw)}` : ""}`;
        const res = await apiFetch<ProjectsData>(qs);
        if (res.code === 200) {
          setProjects(res.data.projects || []);
          setTotal(res.data.total);
        } else {
          message.error(res.message || "获取项目列表失败");
        }
      } catch {
        message.error("获取项目列表失败");
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    fetchProjects(currentPage, keyword);
  }, [currentPage, keyword, fetchProjects]);

  const handleSearch = () => {
    setKeyword(searchInput);
    setCurrentPage(1);
  };

  const handleCreate = async (values: ProjectFormValues) => {
    setCreateLoading(true);
    try {
      const res = await apiFetch("/v1/projects", {
        method: "POST",
        body: JSON.stringify({
          name: values.name,
          description: values.description || "",
          github: values.github || "",
          site: values.site || "",
          tags: values.tags || [],
        }),
      });
      if (res.code === 200 || res.code === 201) {
        message.success("项目创建成功");
        setCreateOpen(false);
        createForm.resetFields();
        fetchProjects(1, keyword);
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

  const openEdit = (project: Project) => {
    setEditingProject(project);
    editForm.setFieldsValue({
      name: project.name,
      description: project.description,
      github: project.github,
      site: project.site,
      tags: project.tags || [],
    });
    setEditOpen(true);
  };

  const handleEdit = async (values: ProjectFormValues) => {
    if (!editingProject) return;
    setEditLoading(true);
    try {
      const res = await apiFetch(`/v1/projects/${editingProject.id}`, {
        method: "PUT",
        body: JSON.stringify({
          name: values.name,
          description: values.description || "",
          github: values.github || "",
          site: values.site || "",
          tags: values.tags || [],
        }),
      });
      if (res.code === 200) {
        message.success("项目更新成功");
        setEditOpen(false);
        editForm.resetFields();
        fetchProjects(currentPage, keyword);
      } else {
        message.error(res.message || "更新失败");
      }
    } catch {
      message.error("更新失败");
    } finally {
      setEditLoading(false);
    }
  };

  const handleDelete = (project: Project) => {
    Modal.confirm({
      title: "确认删除",
      content: `删除项目「${project.name}」后无法恢复，是否继续？`,
      okText: "删除",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: async () => {
        try {
          const res = await apiFetch(`/v1/projects/${project.id}`, {
            method: "DELETE",
          });
          if (res.code === 200) {
            message.success("项目已删除");
            fetchProjects(currentPage, keyword);
          } else {
            message.error(res.message || "删除失败");
          }
        } catch {
          message.error("删除失败");
        }
      },
    });
  };

  const columns: ColumnsType<Project> = [
    {
      title: "项目名称",
      dataIndex: "name",
      key: "name",
      render: (name: string) => <Text strong>{name}</Text>,
    },
    {
      title: "描述",
      dataIndex: "description",
      key: "description",
      ellipsis: true,
      render: (desc: string) =>
        desc ? (
          <Text>{desc.length > 50 ? desc.slice(0, 50) + "…" : desc}</Text>
        ) : (
          <Text type="secondary">—</Text>
        ),
    },
    {
      title: "GitHub",
      dataIndex: "github",
      key: "github",
      render: (github: string) =>
        github ? (
          <a href={github} target="_blank" rel="noopener noreferrer">
            {github.replace("https://github.com/", "")}
          </a>
        ) : (
          <Text type="secondary">—</Text>
        ),
    },
    {
      title: "网站",
      dataIndex: "site",
      key: "site",
      render: (site: string) =>
        site ? (
          <a href={site} target="_blank" rel="noopener noreferrer">
            {site}
          </a>
        ) : (
          <Text type="secondary">—</Text>
        ),
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
    {
      title: "操作",
      key: "action",
      width: 100,
      render: (_: unknown, record: Project) => (
        <Space size={4}>
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => openEdit(record)}
          />
          <Button
            size="small"
            danger
            icon={<DeleteOutlined />}
            onClick={() => handleDelete(record)}
          />
        </Space>
      ),
    },
  ];

  const projectFormFields = (
    <>
      <Form.Item
        name="name"
        label="项目名称"
        rules={[{ required: true, message: "请输入项目名称" }]}
        style={formItemStyle}
      >
        <Input placeholder="项目名称" />
      </Form.Item>
      <Form.Item name="description" label="描述" style={formItemStyle}>
        <Input.TextArea rows={3} placeholder="项目描述..." />
      </Form.Item>
      <Form.Item name="github" label="GitHub" style={formItemStyle}>
        <Input placeholder="https://github.com/..." />
      </Form.Item>
      <Form.Item name="site" label="网站" style={formItemStyle}>
        <Input placeholder="https://..." />
      </Form.Item>
      <Form.Item name="tags" label="标签" style={formItemStyle}>
        <Select
          mode="tags"
          placeholder="输入标签后回车"
          tokenSeparators={[","]}
          style={{ width: "100%" }}
        />
      </Form.Item>
    </>
  );

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
            项目管理
          </Title>
          <Space>
            <Input
              placeholder="搜索项目名称/描述"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onPressEnter={handleSearch}
              suffix={<SearchOutlined style={{ color: "#999" }} />}
              style={{ width: 240 }}
            />
            <Button onClick={handleSearch}>搜索</Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              style={{ background: "#7c3aed", borderColor: "#7c3aed" }}
              onClick={() => setCreateOpen(true)}
            >
              新增项目
            </Button>
          </Space>
        </div>

        <Table
          columns={columns}
          dataSource={projects}
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

      <Modal
        title="新增项目"
        open={createOpen}
        onCancel={() => {
          setCreateOpen(false);
          createForm.resetFields();
        }}
        onOk={() => createForm.submit()}
        confirmLoading={createLoading}
        okButtonProps={{
          style: { background: "#7c3aed", borderColor: "#7c3aed" },
        }}
      >
        <Form form={createForm} layout="vertical" onFinish={handleCreate}>
          {projectFormFields}
        </Form>
      </Modal>

      <Modal
        title="编辑项目"
        open={editOpen}
        onCancel={() => {
          setEditOpen(false);
          editForm.resetFields();
        }}
        onOk={() => editForm.submit()}
        confirmLoading={editLoading}
        okButtonProps={{
          style: { background: "#7c3aed", borderColor: "#7c3aed" },
        }}
      >
        <Form form={editForm} layout="vertical" onFinish={handleEdit}>
          {projectFormFields}
        </Form>
      </Modal>
    </Layout>
  );
}
