<template>
  <div class="page-container">
    <h2 class="page-title">房型维护</h2>

    <el-card shadow="never">
      <template #header>
        <div class="card-header">
          <span>房型列表</span>
          <el-button type="primary" :icon="Plus" @click="openAddDialog">新增房型</el-button>
        </div>
      </template>

      <el-table :data="roomTypes" v-loading="loading" stripe>
        <el-table-column prop="name" label="房型名称" min-width="140" />
        <el-table-column prop="description" label="描述" min-width="200" show-overflow-tooltip />
        <el-table-column prop="base_price" label="基础价(元/晚)" width="140" align="right">
          <template #default="{ row }">
            <span class="price-text">¥{{ row.base_price?.toFixed(2) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="capacity" label="容量" width="80" align="center">
          <template #default="{ row }">
            {{ row.capacity }}人
          </template>
        </el-table-column>
        <el-table-column prop="bed_count" label="床位数" width="90" align="center">
          <template #default="{ row }">
            {{ row.bed_count }}张
          </template>
        </el-table-column>
        <el-table-column prop="max_guests" label="最多入住" width="100" align="center">
          <template #default="{ row }">
            {{ row.max_guests }}人
          </template>
        </el-table-column>
        <el-table-column prop="area" label="面积(㎡)" width="100" align="center" />
        <el-table-column prop="status" label="状态" width="90" align="center">
          <template #default="{ row }">
            <el-tag :type="row.status === 'active' ? 'success' : 'info'" size="small">
              {{ row.status === 'active' ? '启用' : '停用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="180" fixed="right" align="center">
          <template #default="{ row }">
            <el-button type="primary" link size="small" @click="openEditDialog(row)">编辑</el-button>
            <el-button type="danger" link size="small" @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="dialogVisible" :title="isEdit ? '编辑房型' : '新增房型'" width="600px">
      <el-form :model="form" :rules="rules" ref="formRef" label-width="100px">
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="房型名称" prop="name">
              <el-input v-model="form.name" placeholder="请输入房型名称" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="基础价" prop="base_price">
              <el-input-number v-model="form.base_price" :min="0" :precision="2" style="width: 100%" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="描述" prop="description">
          <el-input v-model="form.description" type="textarea" :rows="3" placeholder="请输入房型描述" />
        </el-form-item>
        <el-row :gutter="20">
          <el-col :span="8">
            <el-form-item label="容量" prop="capacity">
              <el-input-number v-model="form.capacity" :min="1" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="床位数" prop="bed_count">
              <el-input-number v-model="form.bed_count" :min="1" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="最多入住" prop="max_guests">
              <el-input-number v-model="form.max_guests" :min="1" style="width: 100%" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="面积(㎡)" prop="area">
              <el-input-number v-model="form.area" :min="0" :precision="1" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="状态" prop="status">
              <el-radio-group v-model="form.status">
                <el-radio value="active">启用</el-radio>
                <el-radio value="inactive">停用</el-radio>
              </el-radio-group>
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitForm">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import request from '@/api'

const loading = ref(false)
const submitting = ref(false)
const roomTypes = ref([])
const dialogVisible = ref(false)
const isEdit = ref(false)
const formRef = ref(null)
const editId = ref(null)

const defaultForm = {
  name: '',
  description: '',
  base_price: 0,
  capacity: 2,
  bed_count: 1,
  max_guests: 2,
  area: 0,
  status: 'active',
  facilities: [],
  images: []
}

const form = reactive({ ...defaultForm })

const rules = {
  name: [{ required: true, message: '请输入房型名称', trigger: 'blur' }],
  base_price: [{ required: true, message: '请输入基础价格', trigger: 'blur' }]
}

async function loadRoomTypes() {
  loading.value = true
  try {
    const res = await request.get('/room-types')
    roomTypes.value = res.data?.list || []
  } catch (e) {
    ElMessage.error('加载房型列表失败')
  } finally {
    loading.value = false
  }
}

function openAddDialog() {
  isEdit.value = false
  editId.value = null
  Object.assign(form, defaultForm)
  dialogVisible.value = true
}

function openEditDialog(row) {
  isEdit.value = true
  editId.value = row.id
  Object.assign(form, {
    name: row.name,
    description: row.description || '',
    base_price: row.base_price,
    capacity: row.capacity,
    bed_count: row.bed_count,
    max_guests: row.max_guests,
    area: row.area,
    status: row.status || 'active',
    facilities: row.facilities || [],
    images: row.images || []
  })
  dialogVisible.value = true
}

async function submitForm() {
  try {
    await formRef.value.validate()
  } catch (e) {
    return
  }
  submitting.value = true
  try {
    if (isEdit.value) {
      await request.put(`/room-types/${editId.value}`, form)
      ElMessage.success('更新成功')
    } else {
      await request.post('/room-types', form)
      ElMessage.success('创建成功')
    }
    dialogVisible.value = false
    loadRoomTypes()
  } catch (e) {
    ElMessage.error(isEdit.value ? '更新失败' : '创建失败')
  } finally {
    submitting.value = false
  }
}

function handleDelete(row) {
  ElMessageBox.confirm(`确定删除房型「${row.name}」吗？`, '提示', {
    type: 'warning',
    confirmButtonText: '确定',
    cancelButtonText: '取消'
  }).then(async () => {
    try {
      await request.delete(`/room-types/${row.id}`)
      ElMessage.success('删除成功')
      loadRoomTypes()
    } catch (e) {
      ElMessage.error('删除失败')
    }
  }).catch(() => {})
}

onMounted(() => {
  loadRoomTypes()
})
</script>

<style scoped>
.page-container {
  width: 100%;
}

.page-title {
  margin: 0 0 20px;
  font-size: 20px;
  color: #303133;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.price-text {
  color: #f56c6c;
  font-weight: 600;
}
</style>
